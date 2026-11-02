import "dotenv/config";
import pg from "pg";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { decryptBackup, command, metadata } from "./backup-lib.mjs";
const source = process.argv[2];
if (!source)
  throw new Error(
    "Usage: npm run restore:verify -- private/backups/backup_TIMESTAMP.bin",
  );
const dir = await mkdtemp(path.join(os.tmpdir(), "texan-restore-")),
  zip = path.join(dir, "verified.zip"),
  name = "texan-restore-test-" + randomBytes(6).toString("hex");
let started = false,
  client;
try {
  await decryptBackup(source, zip, process.env.BACKUP_PASSPHRASE);
  const manifest = JSON.parse(
    await command("unzip", ["-p", zip, "manifest.json"]),
  );
  await command("docker", [
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_USER=texan",
    "-e",
    "POSTGRES_PASSWORD=local-restore-only",
    "-e",
    "POSTGRES_DB=texan_restore_verification",
    "postgres:17-alpine",
  ]);
  started = true;
  const port = (await command("docker", ["port", name, "5432"]))
    .trim()
    .split(":")
    .pop();
  for (let n = 0; n < 30; n++) {
    try {
      await command("docker", ["exec", name, "pg_isready", "-U", "texan"]);
      break;
    } catch {
      if (n === 29) throw new Error("Restore database did not start.");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const input = spawn("unzip", ["-p", zip, "database.dump"], {
      stdio: ["ignore", "pipe", "ignore"],
    }),
    restore = spawn(
      "docker",
      [
        "exec",
        "-i",
        name,
        "pg_restore",
        "-U",
        "texan",
        "-d",
        "texan_restore_verification",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
  const exit = new Promise((resolve, reject) => {
    restore.stderr.resume();
    restore.on("error", reject);
    restore.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error("Restore failed; no production database was touched."),
          ),
    );
  });
  await pipeline(input.stdout, restore.stdin);
  await exit;
  client = new pg.Client({
    connectionString: `postgresql://texan:local-restore-only@127.0.0.1:${port}/texan_restore_verification`,
  });
  await client.connect();
  const actual = await metadata(client);
  for (const key of ["counts", "totals", "versions"])
    if (JSON.stringify(actual[key]) !== JSON.stringify(manifest[key]))
      throw new Error(
        `Restored ${key} do not match the consistent backup snapshot.`,
      );
  for (const asset of manifest.assets) {
    const file = spawn("unzip", ["-p", zip, "objects/" + asset.storageKey], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const hash = createHash("sha256");
    let size = 0;
    for await (const b of file.stdout) {
      hash.update(b);
      size += b.length;
    }
    if (hash.digest("hex") !== asset.sha256 || size !== asset.sizeBytes)
      throw new Error("A private file failed restored hash/size verification.");
  }
  console.log(
    JSON.stringify({
      result: "PASS",
      isolatedDatabase: true,
      tables: Object.keys(actual.counts).length,
      issuedPdfHashes: actual.versions.length,
      privateFiles: manifest.assets.length,
      financialTotalsMatch: true,
    }),
  );
} finally {
  await client?.end();
  if (started) await command("docker", ["rm", "-f", name]);
  await rm(dir, { recursive: true, force: true });
}
