import { storeBytes, openStored, removeStored } from "./storage";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { type Actor, visibleJob, jobScope } from "./access";
import { HttpError } from "./errors";
import { newToken } from "./security";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const types: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  ".pdf": {
    mime: "application/pdf",
    magic: (b) => b.subarray(0, 5).toString() === "%PDF-",
  },
  ".png": {
    mime: "image/png",
    magic: (b) =>
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  ".jpg": {
    mime: "image/jpeg",
    magic: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  ".jpeg": {
    mime: "image/jpeg",
    magic: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  ".webp": {
    mime: "image/webp",
    magic: (b) =>
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP",
  },
};
export function validateFile(
  name: string,
  mime: string,
  size: number,
  bytes?: Buffer,
) {
  if (size > MAX_FILE_SIZE)
    throw new HttpError(413, "File exceeds the 10 MiB limit.");
  if (!size) throw new HttpError(400, "File is empty.");
  const type = types[path.extname(name).toLowerCase()];
  if (!type || type.mime !== mime || (bytes && !type.magic(bytes)))
    throw new HttpError(
      400,
      "File type is not allowed or content does not match. Use PDF, PNG, JPEG or WebP.",
    );
}
export async function fileScope(a: Actor): Promise<Prisma.FileAssetWhereInput> {
  const owners = await db.user.findMany({
    where: { organizationId: a.organizationId },
    select: { id: true },
  });
  return {
    deletedAt: null,
    uploadedById: { in: owners.map((u) => u.id) },
    ...(a.role === "TECHNICIAN"
      ? { OR: [{ uploadedById: a.id }, { jobPhotos: { some: jobScope(a) } }] }
      : {}),
  };
}
export async function visibleFile(a: Actor, id: string) {
  const row = await db.fileAsset.findFirst({
    where: { AND: [await fileScope(a), { id }] },
  });
  if (!row) throw new HttpError(404, "File not found.");
  return row;
}
export async function upload(
  a: Actor,
  file: File,
  jobId?: string,
  intentId?: string,
) {
  validateFile(file.name, file.type, file.size);
  if (jobId) await visibleJob(a, jobId);
  const bytes = Buffer.from(await file.arrayBuffer());
  validateFile(file.name, file.type, bytes.length, bytes);
  const key = newToken();
  await storeBytes(key, bytes, file.type);
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.fileAsset.create({
        data: {
          storageKey: key,
          filename: path
            .basename(file.name)
            .replace(/[\r\n]/g, "_")
            .slice(0, 200),
          mimeType: file.type,
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedById: a.id,
          ...(jobId ? { jobPhotos: { connect: { id: jobId } } } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: a.organizationId,
          userId: a.id,
          entity: "FileAsset",
          entityId: row.id,
          action: "UPLOAD",
        },
      });
      if (intentId)
        await tx.uploadIntent.update({
          where: { id: intentId },
          data: { resultId: row.id },
        });
      return { id: row.id, filename: row.filename };
    });
  } catch (e) {
    await removeStored(key);
    throw e;
  }
}
function signature(id: string, userId: string, expires: number) {
  if (!process.env.AUTH_SECRET) throw new Error("Missing AUTH_SECRET");
  return createHmac("sha256", process.env.AUTH_SECRET)
    .update(`${id}:${userId}:${expires}`)
    .digest("hex");
}
export async function signedUrl(a: Actor, id: string) {
  await visibleFile(a, id);
  const expires = Math.floor(Date.now() / 1000) + 300;
  return {
    url: `/api/files/${id}?expires=${expires}&signature=${signature(id, a.id, expires)}`,
    expires,
  };
}
export async function download(
  a: Actor,
  id: string,
  expires: number,
  sig: string,
) {
  if (
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(Date.now() / 1000) ||
    expires > Math.floor(Date.now() / 1000) + 300 ||
    !/^[0-9a-f]{64}$/.test(sig)
  )
    throw new HttpError(404, "Link is invalid or expired.");
  if (
    !timingSafeEqual(
      Buffer.from(signature(id, a.id, expires)),
      Buffer.from(sig),
    )
  )
    throw new HttpError(404, "Link is invalid or expired.");
  const row = await visibleFile(a, id);
  if (!/^[A-Za-z0-9_-]+$/.test(row.storageKey))
    throw new HttpError(404, "File not found.");
  return {
    row,

    stream: () => openStored(row.storageKey),
  };
}
