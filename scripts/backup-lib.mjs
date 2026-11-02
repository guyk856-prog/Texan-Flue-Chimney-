import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir, open, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { spawn } from "node:child_process";
export function pgUrl(value) {
  const u = new URL(value);
  for (const k of ["schema", "connection_limit", "pool_timeout"])
    u.searchParams.delete(k);
  return u.toString();
}
export async function command(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      ...options,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    const out = [],
      err = [];
    p.stdout?.on("data", (b) => out.push(b));
    p.stderr?.on("data", (b) => err.push(b));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out).toString())
        : reject(
            new Error(
              `${cmd} failed (${code}). Check connectivity and client/database versions. Diagnostic output is withheld to avoid exposing connection details.`,
            ),
          ),
    );
  });
}
export async function metadata(client) {
  const names = [
    "Organization",
    "User",
    "Customer",
    "Property",
    "Job",
    "Document",
    "DocumentVersion",
    "Estimate",
    "Invoice",
    "PaymentRecord",
    "Receipt",
    "Inspection",
    "InspectionFinding",
    "FileAsset",
    "Signature",
    "ConsentRecord",
    "AIExtraction",
    "TemplateVersion",
    "AuditLog",
  ];
  const counts = {};
  for (const name of names)
    counts[name] = (
      await client.query(`SELECT count(*)::text AS n FROM "${name}"`)
    ).rows[0].n;
  const totals = (
    await client.query(
      'SELECT (SELECT COALESCE(sum("totalCents"),0)::text FROM "Invoice") AS invoices,(SELECT COALESCE(sum("amountCents"),0)::text FROM "PaymentRecord" WHERE "reversedAt" IS NULL) AS received',
    )
  ).rows[0];
  const versions = (
    await client.query(
      'SELECT id,"contentHash" FROM "DocumentVersion" WHERE "issuedAt" IS NOT NULL ORDER BY id',
    )
  ).rows;
  return { counts, totals, versions };
}
export async function encryptZip(zip, target, password) {
  if (!password || password.length < 32)
    throw new Error(
      "BACKUP_PASSPHRASE must contain at least 32 characters. Store it separately in a password manager.",
    );
  const salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  async function* chunks() {
    yield Buffer.concat([Buffer.from("TFBACKUP1"), salt, iv]);
    for await (const b of createReadStream(zip).pipe(cipher)) yield b;
    yield cipher.getAuthTag();
  }
  await pipeline(
    Readable.from(chunks()),
    createWriteStream(target, { mode: 0o600, flags: "wx" }),
  );
}
export async function decryptBackup(file, target, password) {
  if (!password || password.length < 32)
    throw new Error("Set BACKUP_PASSPHRASE to the original backup passphrase.");
  const size = (await stat(file)).size;
  if (size < 53) throw new Error("Backup is incomplete.");
  const f = await open(file, "r");
  const header = Buffer.alloc(37),
    tag = Buffer.alloc(16);
  try {
    await f.read(header, 0, 37, 0);
    await f.read(tag, 0, 16, size - 16);
  } finally {
    await f.close();
  }
  if (header.subarray(0, 9).toString() !== "TFBACKUP1")
    throw new Error("Unrecognized backup format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    scryptSync(password, header.subarray(9, 25), 32),
    header.subarray(25, 37),
  );
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(file, { start: 37, end: size - 17 }),
    decipher,
    createWriteStream(target, { mode: 0o600, flags: "wx" }),
  );
}
export async function shaFile(file) {
  const h = createHash("sha256");
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest("hex");
}
export async function privateDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}
export { readFile, writeFile };
