import { put, get, del } from "@vercel/blob";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { HttpError } from "./errors";
export function objectStorage() {
  return process.env.STORAGE_DRIVER === "vercel-blob";
}
export function storageDirectory() {
  if (process.env.VERCEL && !objectStorage())
    throw new Error("Persistent private object storage must be configured.");
  const root = path.resolve(
    /* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_DIR ??
      "./private/uploads",
  );
  if (
    root === path.resolve("public") ||
    root.startsWith(path.resolve("public") + path.sep)
  )
    throw new Error("Storage must be private");
  return root;
}
function key(value: string) {
  if (!/^[A-Za-z0-9_-]{8,150}$/.test(value))
    throw new HttpError(404, "File not found.");
  return value;
}
export async function storeBytes(
  id: string,
  bytes: Buffer,
  mime = "application/octet-stream",
) {
  key(id);
  if (objectStorage()) {
    if (!process.env.BLOB_READ_WRITE_TOKEN)
      throw new Error("Private object storage is not configured");
    await put(id, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: mime,
    });
    return;
  }
  const directory = storageDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, id), bytes, { flag: "wx", mode: 0o600 });
}
export async function openStored(
  id: string,
): Promise<ReadableStream<Uint8Array>> {
  key(id);
  if (objectStorage()) {
    const result = await get(id, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200)
      throw new HttpError(404, "File not found.");
    return result.stream;
  }
  return Readable.toWeb(
    createReadStream(path.join(storageDirectory(), id)),
  ) as ReadableStream<Uint8Array>;
}
export async function readStored(id: string, maxBytes = 24 * 1024 * 1024) {
  key(id);
  if (!objectStorage()) return readFile(path.join(storageDirectory(), id));
  const reader = (await openStored(id)).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const n = await reader.read();
      if (n.done) break;
      size += n.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Stored file exceeds the permitted size.");
      }
      chunks.push(n.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function removeStored(id: string) {
  key(id);
  if (objectStorage()) await del(id);
  else await unlink(path.join(storageDirectory(), id));
}
