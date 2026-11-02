// Runs only through the explicit recovery workflow against a new, EMPTY database and private store.
import "dotenv/config";
import pg from "pg";
import { get, list, put } from "@vercel/blob";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { decryptBackup, command, metadata, pgUrl } from "./backup-lib.mjs";
if (process.env.RESTORE_CONFIRM !== "RESTORE TO EMPTY TARGET")
  throw new Error("Recovery requires the exact confirmation phrase.");
const filename = process.env.RESTORE_BACKUP_NAME;
if (!/^backup_[0-9]+\.bin$/.test(filename ?? ""))
  throw new Error("Select a backup_FILENAME.bin from the backup store.");
if (
  !process.env.RESTORE_DIRECT_URL ||
  !process.env.RESTORE_BLOB_READ_WRITE_TOKEN
)
  throw new Error("Configure the new empty restore database and store first.");
const dir = await mkdtemp(path.join(os.tmpdir(), "texan-recovery-")),
  encrypted = path.join(dir, "backup.bin"),
  zip = path.join(dir, "restore.zip");
const target = new pg.Client({
  connectionString: pgUrl(process.env.RESTORE_DIRECT_URL),
});
try {
  await target.connect();
  const tables = (
    await target.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    )
  ).rows[0].n;
  if (tables !== 0)
    throw new Error("Target database is not empty. Recovery refused.");
  if (
    (await list({ token: process.env.RESTORE_BLOB_READ_WRITE_TOKEN, limit: 1 }))
      .blobs.length
  )
    throw new Error("Target private store is not empty. Recovery refused.");
  const blob = await get(filename, {
    access: "private",
    token: process.env.BACKUP_BLOB_READ_WRITE_TOKEN,
  });
  if (!blob || blob.statusCode !== 200)
    throw new Error("Encrypted backup not found.");
  await pipeline(
    Readable.fromWeb(blob.stream),
    createWriteStream(encrypted, { mode: 0o600, flags: "wx" }),
  );
  await decryptBackup(encrypted, zip, process.env.BACKUP_PASSPHRASE);
  const manifest = JSON.parse(
    await command("unzip", ["-p", zip, "manifest.json"]),
  );
  const input = spawn("unzip", ["-p", zip, "database.dump"], {
      stdio: ["ignore", "pipe", "ignore"],
    }),
    restore = spawn(
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "--network",
        "host",
        "-e",
        "RESTORE_DIRECT_URL",
        "postgres:17-alpine",
        "sh",
        "-c",
        'exec pg_restore --dbname="$RESTORE_DIRECT_URL" --no-owner --no-acl --exit-on-error',
      ],
      {
        env: {
          ...process.env,
          RESTORE_DIRECT_URL: pgUrl(process.env.RESTORE_DIRECT_URL),
        },
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
  const done = new Promise((resolve, reject) => {
    restore.stderr.resume();
    restore.on("error", reject);
    restore.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error("Restore failed. Do not switch the app to this target."),
          ),
    );
  });
  await pipeline(input.stdout, restore.stdin);
  await done;
  const actual = await metadata(target);
  for (const k of ["counts", "totals", "versions"])
    if (JSON.stringify(actual[k]) !== JSON.stringify(manifest[k]))
      throw new Error(
        "Database verification failed. Do not switch the application.",
      );
  for (const asset of manifest.assets) {
    if (!/^[A-Za-z0-9_-]+$/.test(asset.storageKey))
      throw new Error("Invalid stored-file key.");
    const file = spawn("unzip", ["-p", zip, "objects/" + asset.storageKey], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    await put(asset.storageKey, file.stdout, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: asset.mimeType ?? "application/octet-stream",
      token: process.env.RESTORE_BLOB_READ_WRITE_TOKEN,
    });
    const check = await get(asset.storageKey, {
      access: "private",
      token: process.env.RESTORE_BLOB_READ_WRITE_TOKEN,
      useCache: false,
    });
    if (!check || check.statusCode !== 200)
      throw new Error("Restored private file is missing.");
    const hash = createHash("sha256");
    let size = 0;
    for await (const b of Readable.fromWeb(check.stream)) {
      hash.update(b);
      size += b.length;
    }
    if (hash.digest("hex") !== asset.sha256 || size !== asset.sizeBytes)
      throw new Error("Restored file hash verification failed.");
  }
  console.log(
    JSON.stringify({
      result: "PASS",
      databaseCountsMatch: true,
      financialTotalsMatch: true,
      issuedHashes: actual.versions.length,
      privateFiles: manifest.assets.length,
      next: "Switch Vercel database and storage variables to the verified targets, then redeploy. No switch was performed by this workflow.",
    }),
  );
} finally {
  await target.end();
  await rm(dir, { recursive: true, force: true });
}
