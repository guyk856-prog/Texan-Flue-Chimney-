import "dotenv/config";
import pg from "pg";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { put } from "@vercel/blob";
import { openStored } from "../src/lib/storage.ts";
import {
  pgUrl,
  metadata,
  encryptZip,
  shaFile,
  privateDir,
} from "./backup-lib.mjs";
const root = await privateDir(path.resolve("private/backups"));
const key = "backup_" + new Date().toISOString().replace(/[^0-9]/g, "");
const zip = path.join(root, key + ".zip"),
  target = path.join(root, key + ".bin");
if (!process.env.BACKUP_PASSPHRASE || process.env.BACKUP_PASSPHRASE.length < 32)
  throw new Error("Set BACKUP_PASSPHRASE securely before backing up.");
const client = new pg.Client({
  connectionString: pgUrl(process.env.DIRECT_URL ?? process.env.DATABASE_URL),
  application_name: "texan-backup",
});
const archive = new ZipArchive({ zlib: { level: 6 } }),
  destination = createWriteStream(zip, { mode: 0o600, flags: "wx" });
archive.pipe(destination);
try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (await client.query("SELECT pg_export_snapshot() AS id"))
    .rows[0].id;
  const expected = await metadata(client);
  const assets = (
    await client.query(
      'SELECT "storageKey",sha256,"sizeBytes","mimeType" FROM "FileAsset" ORDER BY "storageKey"',
    )
  ).rows;
  const manifest = {
    createdAt: new Date().toISOString(),
    format: 1,
    ...expected,
    assets,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  const dump = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "host",
      "-e",
      "DATABASE_BACKUP_URL",
      "-e",
      "DATABASE_SNAPSHOT",
      "postgres:17-alpine",
      "sh",
      "-c",
      'exec pg_dump --format=custom --no-owner --no-acl --snapshot="$DATABASE_SNAPSHOT" --dbname="$DATABASE_BACKUP_URL"',
    ],
    {
      env: {
        ...process.env,
        DATABASE_BACKUP_URL: pgUrl(
          process.env.DIRECT_URL ?? process.env.DATABASE_URL,
        ),
        DATABASE_SNAPSHOT: snapshot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const dumpDone = new Promise((resolve, reject) => {
    dump.stderr.resume();
    dump.on("error", reject);
    dump.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Database dump failed. Backup was not published.")),
    );
  });
  archive.append(dump.stdout, { name: "database.dump" });
  await dumpDone;
  for (const asset of assets) {
    if (!/^[A-Za-z0-9_-]+$/.test(asset.storageKey))
      throw new Error("Invalid file key in backup manifest.");
    archive.append(Readable.fromWeb(await openStored(asset.storageKey)), {
      name: "objects/" + asset.storageKey,
    });
  }
  await archive.finalize();
  await finished(destination);
  await client.query("COMMIT");
  await encryptZip(zip, target, process.env.BACKUP_PASSPHRASE);
  const sha256 = await shaFile(target);
  if (process.env.BACKUP_BLOB_READ_WRITE_TOKEN)
    await put(
      key + ".bin",
      await import("node:fs").then((fs) => fs.createReadStream(target)),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        token: process.env.BACKUP_BLOB_READ_WRITE_TOKEN,
        contentType: "application/octet-stream",
      },
    );
  console.log(
    JSON.stringify({
      backup: path.basename(target),
      sha256,
      databaseTables: Object.keys(expected.counts).length,
      privateFiles: assets.length,
      published: !!process.env.BACKUP_BLOB_READ_WRITE_TOKEN,
    }),
  );
  await rm(zip, { force: true });
} catch (e) {
  archive.destroy();
  destination.destroy();
  await rm(zip, { force: true });
  throw e;
} finally {
  await client.end();
}
