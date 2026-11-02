import { actor, admin } from "@/lib/access";
import { sameOrigin, readJson, failure, HttpError } from "@/lib/errors";
import { db } from "@/lib/db";
import { z } from "zod";
import { visibleFile, upload } from "@/lib/files";
import { readStored } from "@/lib/storage";
import sharp from "sharp";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(req);
    const a = await actor();
    admin(a);
    const { action } = await params;
    const raw = await readJson(req, 20000);
    if (action === "company") {
      const data = z
        .object({
          name: z.string().min(1).max(200),
          phone: z.string().min(1).max(50),
          email: z.union([z.email(), z.literal("")]),
          addrLine1: z.string().min(1).max(250),
          city: z.string().min(1).max(100),
          state: z.string().min(1).max(100),
          postal: z.string().min(1).max(30),
        })
        .strict()
        .parse(raw);
      await db.$transaction([
        db.organization.update({ where: { id: a.organizationId }, data }),
        db.auditLog.create({
          data: {
            organizationId: a.organizationId,
            userId: a.id,
            entity: "Organization",
            entityId: a.organizationId,
            action: "CONFIRM_COMPANY",
          },
        }),
      ]);
      return Response.json({ saved: true });
    }
    if (action === "logo") {
      const { fileId } = z.object({ fileId: z.string() }).strict().parse(raw);
      const file = await visibleFile(a, fileId);
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimeType))
        throw new HttpError(400, "Choose a PNG, JPEG or WebP logo.");
      const bytes = await sharp(await readStored(file.storageKey), {
        limitInputPixels: 40000000,
      })
        .resize({
          width: 600,
          height: 600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp()
        .toBuffer();
      const saved = await upload(
        a,
        new File([new Uint8Array(bytes)], "company-logo.webp", {
          type: "image/webp",
        }),
      );
      await db.$transaction([
        db.organization.update({
          where: { id: a.organizationId },
          data: { logoId: saved.id },
        }),
        db.auditLog.create({
          data: {
            organizationId: a.organizationId,
            userId: a.id,
            entity: "Organization",
            entityId: a.organizationId,
            action: "SET_LOGO",
            after: { fileId: saved.id },
          },
        }),
      ]);
      return Response.json({ saved: true });
    }
    if (action === "finish") {
      z.object({
        companyConfirmed: z.literal(true),
        libraryReviewed: z.literal(true),
        policyReviewed: z.literal(true),
      })
        .strict()
        .parse(raw);
      await db.$transaction([
        db.organizationSettings.update({
          where: { organizationId: a.organizationId },
          data: { onboardingCompletedAt: new Date() },
        }),
        db.auditLog.create({
          data: {
            organizationId: a.organizationId,
            userId: a.id,
            entity: "Organization",
            entityId: a.organizationId,
            action: "COMPLETE_SETUP",
          },
        }),
      ]);
      return Response.json({ saved: true });
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
}
