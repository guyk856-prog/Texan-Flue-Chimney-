import { list, del } from "@vercel/blob";
const token = process.env.BACKUP_BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("Backup store token is required.");
const days = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
if (!Number.isInteger(days) || days < 30)
  throw new Error("Backup retention must be at least 30 days.");
let cursor,
  deleted = 0;
do {
  const batch = await list({ token, prefix: "backup_", cursor, limit: 1000 });
  for (const blob of batch.blobs)
    if (new Date(blob.uploadedAt).getTime() < Date.now() - days * 86400000) {
      await del(blob.url, { token });
      deleted++;
    }
  cursor = batch.hasMore ? batch.cursor : undefined;
} while (cursor);
console.log("Expired encrypted backups removed:", deleted);
