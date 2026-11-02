import { actor, office, visibleJob } from "@/lib/access";
import { failure, sameOrigin, readJson, HttpError } from "@/lib/errors";
import { db } from "@/lib/db";
import { objectStorage, readStored, removeStored } from "@/lib/storage";
import { upload, validateFile, MAX_FILE_SIZE } from "@/lib/files";
import { newToken } from "@/lib/security";
import { readInspection, inspectionPhoto } from "@/lib/inspections";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  try {
    await actor();
    return Response.json(
      { direct: objectStorage() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (action === "upload") {
      const body = (await readJson(req, 20000)) as HandleUploadBody;
      if (body.type !== "blob.upload-completed") sameOrigin(req);
      const response = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname, payload) => {
          const a = await actor();
          const id = z.string().max(100).parse(payload);
          const intent = await db.uploadIntent.findFirst({
            where: {
              id,
              userId: a.id,
              organizationId: a.organizationId,
              consumedAt: null,
              expiresAt: { gt: new Date() },
            },
          });
          if (!intent || intent.storageKey !== pathname)
            throw new HttpError(
              404,
              "Upload authorization expired. Select Retry.",
            );
          return {
            allowedContentTypes: [intent.mimeType],
            maximumSizeInBytes: intent.sizeBytes,
            validUntil: Date.now() + 300000,
            addRandomSuffix: false,
            allowOverwrite: false,
            tokenPayload: id,
          };
        },
      });
      return Response.json(response);
    }
    sameOrigin(req);
    const a = await actor();
    if (action === "intent") {
      const v = z
        .object({
          filename: z.string().min(1).max(200),
          mimeType: z.string().max(100),
          sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE),
          purpose: z.enum(["FILE", "INSPECTION", "AI_SOURCE"]),
          resourceId: z.string().max(100).nullable(),
          metadata: z.record(z.string(), z.unknown()),
        })
        .strict()
        .parse(await readJson(req, 5000));
      validateFile(v.filename, v.mimeType, v.sizeBytes);
      if (v.purpose === "INSPECTION") {
        if (!v.resourceId) throw new HttpError(400, "Select an inspection.");
        const r = await readInspection(a, v.resourceId);
        if (
          r.status !== "DRAFT" ||
          (a.role === "TECHNICIAN" && r.technicianId !== a.id)
        )
          throw new HttpError(
            403,
            "Only your editable inspection can receive photos.",
          );
        if (
          !r.sections.some((s) =>
            s.findings.some((f) => f.id === v.metadata.findingId),
          )
        )
          throw new HttpError(404, "Finding not found.");
        if (!v.mimeType.startsWith("image/"))
          throw new HttpError(400, "Choose an image for inspection evidence.");
      } else {
        if (v.purpose === "AI_SOURCE") office(a);
        if (v.metadata.jobId)
          await visibleJob(a, z.string().parse(v.metadata.jobId));
      }
      const intent = await db.uploadIntent.create({
        data: {
          ...v,
          metadata: JSON.parse(JSON.stringify(v.metadata)),
          userId: a.id,
          organizationId: a.organizationId,
          storageKey: "q_" + newToken(),
          expiresAt: new Date(Date.now() + 1800000),
        },
      });
      return Response.json(
        { id: intent.id, storageKey: intent.storageKey },
        { status: 201 },
      );
    }
    if (action === "commit") {
      const { id } = z
        .object({ id: z.string().max(100) })
        .strict()
        .parse(await readJson(req, 1000));
      const intent = await db.uploadIntent.findFirst({
        where: { id, userId: a.id, organizationId: a.organizationId },
      });
      if (!intent) throw new HttpError(404, "Upload not found.");
      if (intent.resultId)
        return Response.json({
          id: intent.resultId,
          filename: intent.filename,
        });
      if (intent.expiresAt <= new Date())
        throw new HttpError(404, "Upload authorization expired. Select Retry.");
      const claim = await db.uploadIntent.updateMany({
        where: {
          id,
          resultId: null,
          OR: [
            { consumedAt: null },
            { consumedAt: { lt: new Date(Date.now() - 300000) } },
          ],
        },
        data: { consumedAt: new Date() },
      });
      if (!claim.count)
        throw new HttpError(
          409,
          "Upload is still being checked. Retry in a moment.",
        );
      try {
        const bytes = await readStored(intent.storageKey, MAX_FILE_SIZE);
        if (bytes.length !== intent.sizeBytes)
          throw new HttpError(
            400,
            "File size changed during upload. Select the original file again.",
          );
        validateFile(intent.filename, intent.mimeType, bytes.length, bytes);
        const file = new File([new Uint8Array(bytes)], intent.filename, {
          type: intent.mimeType,
        });
        const meta = intent.metadata as Record<string, unknown>;
        const result =
          intent.purpose === "INSPECTION"
            ? await inspectionPhoto(a, intent.resourceId!, file, meta, id)
            : await upload(
                a,
                file,
                typeof meta.jobId === "string" ? meta.jobId : undefined,
                id,
              );
        await db.uploadIntent.update({
          where: { id },
          data: { resultId: result.id },
        });
        await removeStored(intent.storageKey).catch(() => {});
        return Response.json({ id: result.id, filename: intent.filename });
      } catch (e) {
        await db.uploadIntent.update({
          where: { id },
          data: { consumedAt: null },
        });
        throw e;
      }
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
}
