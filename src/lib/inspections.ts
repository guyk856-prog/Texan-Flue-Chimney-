import { Prisma } from "@prisma/client";
import { z } from "zod";
import sharp from "sharp";
import { db } from "./db";
import { type Actor, jobScope, office, admin } from "./access";
import { HttpError } from "./errors";
import { snapshotSchema } from "./snapshot";
import {
  transaction,
  audit,
  json,
  baseSnapshot,
  freeze,
  blob,
  storedBytes,
  ensureTemplate,
  createNumberedDocument,
  type Tx,
} from "./c-documents";
import { validateFile } from "./files";
import { checklistSchema } from "./checklists";
import { parseLayout } from "./template-contract";
import { saveEstimate } from "./estimates";
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(100);
const text = z.string().max(10000);
export const inspectionInput = z
  .object({
    customerId: id,
    propertyId: id,
    jobId: id,
    technicianId: id.optional(),
    kind: z.enum(["CHIMNEY", "DRYER_VENT"]),
    performedAt: z.iso.datetime({ offset: true }),
    weather: z.string().max(250).default(""),
  })
  .strict();
export function inspectionScope(a: Actor): Prisma.InspectionWhereInput {
  return {
    deletedAt: null,
    document: { organizationId: a.organizationId },
    customer: { deletedAt: null },
    property: { deletedAt: null },
    ...(a.role === "TECHNICIAN" ? { job: { is: jobScope(a) } } : {}),
  };
}
const include = {
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      findings: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          photos: {
            orderBy: { sortOrder: "asc" as const },
            include: { file: true, originalFile: true },
          },
        },
      },
    },
  },
  document: {
    include: { versions: { orderBy: { version: "desc" as const } } },
  },
  technician: { select: { id: true, name: true } },
  customer: true,
  property: true,
} satisfies Prisma.InspectionInclude;
export async function readInspection(a: Actor, id: string, tx: Tx = db) {
  const row = await tx.inspection.findFirst({
    where: { AND: [inspectionScope(a), { id }] },
    include,
  });
  if (!row) throw new HttpError(404, "Inspection not found.");
  return row;
}
export async function listInspections(a: Actor) {
  return db.inspection.findMany({
    where: inspectionScope(a),
    include: {
      customer: { select: { name: true } },
      document: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
async function lock(tx: Tx, a: Actor, id: string, draft = false) {
  await readInspection(a, id, tx);
  await tx.$queryRaw`SELECT id FROM "Inspection" WHERE id=${id} FOR UPDATE`;
  const row = await readInspection(a, id, tx);
  if (a.role === "TECHNICIAN" && row.technicianId !== a.id)
    throw new HttpError(
      403,
      "Only your own inspection can be changed or finalized.",
    );
  if (draft && row.status !== "DRAFT")
    throw new HttpError(
      409,
      "Inspection is signed off or finalized; it cannot be edited.",
    );
  return row;
}
export async function createInspection(a: Actor, raw: unknown) {
  const data = inspectionInput.parse(raw);
  return transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: {
        AND: [
          jobScope(a),
          {
            id: data.jobId,
            customerId: data.customerId,
            propertyId: data.propertyId,
          },
        ],
      },
    });
    if (!job) throw new HttpError(404, "Assigned job not found.");
    const technicianId = a.role === "TECHNICIAN" ? a.id : data.technicianId;
    if (!technicianId) throw new HttpError(400, "Select a technician.");
    const technician = await tx.user.findFirst({
      where: {
        id: technicianId,
        organizationId: a.organizationId,
        role: "TECHNICIAN",
        active: true,
        deletedAt: null,
        assignments: { some: { jobId: job.id } },
      },
    });
    if (!technician)
      throw new HttpError(400, "Select a technician assigned to this job.");
    const type = data.kind === "CHIMNEY" ? "INSPECTION" : "DRYER_VENT_REPORT";
    const doc = await createNumberedDocument(tx, a.organizationId, type);
    const snapshot = await baseSnapshot(
      tx,
      a,
      doc,
      data.customerId,
      data.propertyId,
    );
    const template = await ensureTemplate(tx, a.organizationId, type);
    const checklist = checklistSchema.parse(
      JSON.parse(template.source).checklist,
    );
    const row = await tx.inspection.create({
      data: {
        documentId: doc.id,
        customerId: data.customerId,
        propertyId: data.propertyId,
        jobId: data.jobId,
        technicianId,
        kind: data.kind,
        performedAt: new Date(data.performedAt),
        weather: data.weather,
        sections: {
          create: checklist.map((item, sortOrder) => ({
            ...item,
            sortOrder,
            key: item.key,
            findings: {
              create: {
                key: item.key,
                title: item.title,
                status: "NOT_INSPECTED",
              },
            },
          })),
        },
      },
    });
    snapshot.inspection = {
      kind: data.kind,
      performedAt: data.performedAt,
      weather: data.weather,
      technicianName: technician.name,
      techSignedAt: null,
      sections: checklist.map((s) => ({ title: s.title, findings: [] })),
    };
    await tx.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        templateVersionId: template.id,
        snapshot: json(snapshot),
      },
    });
    await audit(tx, a, "Inspection", row.id, "CREATE");
    return readInspection(a, row.id, tx);
  });
}
export const findingInput = z
  .object({
    id,
    status: z.enum(["PASS", "FAIL", "NA", "NOT_INSPECTED"]),
    severity: z
      .enum(["INFO", "MONITOR", "REPAIR_RECOMMENDED", "URGENT"])
      .nullable(),
    observation: text,
    recommendation: text,
  })
  .strict();
export async function saveInspection(a: Actor, id: string, raw: unknown) {
  const data = z
    .object({
      limitations: text,
      summary: text,
      recommendations: text,
      weather: z.string().max(250),
      findings: z.array(findingInput).min(1).max(100),
    })
    .strict()
    .parse(raw);
  return transaction(async (tx) => {
    const row = await lock(tx, a, id, true);
    const ids = new Set(
      row.sections.flatMap((s) => s.findings.map((f) => f.id)),
    );
    if (
      data.findings.length !== ids.size ||
      new Set(data.findings.map((f) => f.id)).size !== ids.size ||
      data.findings.some((f) => !ids.has(f.id))
    )
      throw new HttpError(
        400,
        "Submit exactly the findings in this inspection.",
      );
    await tx.inspection.update({
      where: { id },
      data: {
        limitations: data.limitations,
        summary: data.summary,
        recommendations: data.recommendations,
        weather: data.weather,
      },
    });
    for (const f of data.findings) {
      const { id: fid, ...fields } = f;
      await tx.inspectionFinding.update({ where: { id: fid }, data: fields });
    }
    await audit(tx, a, "Inspection", id, "UPDATE");
    return readInspection(a, id, tx);
  });
}
async function fullSnapshot(tx: Tx, a: Actor, id: string) {
  const row = await readInspection(a, id, tx);
  const snapshot = await baseSnapshot(
    tx,
    a,
    row.document,
    row.customerId,
    row.propertyId,
  );
  snapshot.limitations = row.limitations ?? "";
  snapshot.summary = row.summary ?? "";
  snapshot.recommendations = row.recommendations ?? "";
  snapshot.inspection = {
    kind: row.kind,
    performedAt: row.performedAt.toISOString(),
    weather: row.weather ?? "",
    technicianName: row.technician.name,
    techSignedAt: row.techSignedAt?.toISOString() ?? null,
    sections: await Promise.all(
      row.sections.map(async (s) => ({
        title: s.title,
        findings: await Promise.all(
          s.findings.map(async (f) => ({
            id: f.id,
            title: f.title,
            status: f.status,
            severity: f.severity,
            observation: f.observation ?? "",
            recommendation: f.recommendation ?? "",
            photos: await Promise.all(
              f.photos.map(async (p) => {
                if (p.file.deletedAt)
                  throw new HttpError(409, "An inspection photo was archived.");
                return {
                  data: `data:image/jpeg;base64,${(await storedBytes(p.file.storageKey)).toString("base64")}`,
                  caption: p.caption ?? "",
                  phase: p.phase,
                  pairKey: p.pairKey,
                };
              }),
            ),
          })),
        ),
      })),
    ),
  };
  return snapshot;
}
export async function signoffInspection(a: Actor, id: string, raw: unknown) {
  z.object({ confirmed: z.literal(true) })
    .strict()
    .parse(raw);
  return transaction(async (tx) => {
    const row = await lock(tx, a, id, true);
    if (row.technicianId !== a.id)
      throw new HttpError(
        403,
        "The assigned inspection technician must sign off personally.",
      );
    if (!row.limitations?.trim())
      throw new HttpError(
        400,
        "Enter limitations and areas not examined before sign-off.",
      );
    await tx.inspection.update({
      where: { id },
      data: { status: "TECH_SIGNED", techSignedAt: new Date() },
    });
    const snapshot = await fullSnapshot(tx, a, id);
    await tx.documentVersion.update({
      where: { id: row.document.versions[0].id },
      data: { snapshot: json(snapshot) },
    });
    await tx.signature.create({
      data: {
        documentVersionId: row.document.versions[0].id,
        signerName: a.name,
        typedName: a.name,
        action: "ACKNOWLEDGE",
      },
    });
    await audit(tx, a, "Inspection", id, "TECH_SIGNOFF");
    return readInspection(a, id, tx);
  });
}
export async function finalizeInspection(a: Actor, id: string) {
  return transaction(async (tx, files) => {
    const row = await lock(tx, a, id);
    if (row.status !== "TECH_SIGNED" || !row.techSignedAt)
      throw new HttpError(
        409,
        "Technician sign-off is required before finalizing.",
      );
    const snapshot = snapshotSchema.parse(row.document.versions[0].snapshot);
    if (!snapshot.limitations.trim())
      throw new HttpError(400, "Limitations are required before finalizing.");
    snapshot.document.status = "FINALIZED";
    await freeze(tx, files, a, snapshot, row.jobId);
    await tx.inspection.update({
      where: { id },
      data: { status: "FINALIZED", finalizedAt: new Date() },
    });
    await audit(tx, a, "Inspection", id, "FINALIZE");
    return readInspection(a, id, tx);
  });
}
export async function inspectionPhoto(
  a: Actor,
  id: string,
  file: File,
  raw: unknown,
) {
  const meta = z
    .object({
      findingId: z.string(),
      caption: z.string().max(1000).default(""),
      pairKey: z.string().max(100).nullable(),
      phase: z.enum(["BEFORE", "AFTER"]).nullable(),
    })
    .strict()
    .parse(raw);
  validateFile(file.name, file.type, file.size);
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new HttpError(400, "Inspection photos must be PNG, JPEG or WebP.");
  const bytes = Buffer.from(await file.arrayBuffer());
  validateFile(file.name, file.type, bytes.length, bytes);
  let compressed: Buffer;
  try {
    compressed = await sharp(bytes, { limitInputPixels: 40000000 })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new HttpError(400, "Image cannot be decoded safely.");
  }
  if (compressed.length > 512 * 1024)
    compressed = await sharp(bytes, { limitInputPixels: 40000000 })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 65 })
      .toBuffer();
  if (compressed.length > 512 * 1024)
    throw new HttpError(
      400,
      "Photo is too complex to include safely; choose a smaller image.",
    );
  return transaction(async (tx, files) => {
    const row = await lock(tx, a, id, true);
    if (
      !row.sections.some((s) => s.findings.some((f) => f.id === meta.findingId))
    )
      throw new HttpError(404, "Finding not found.");
    if (
      row.sections.flatMap((s) => s.findings).flatMap((f) => f.photos).length >=
      30
    )
      throw new HttpError(400, "Maximum 30 photos per inspection.");
    const original = await blob(
      tx,
      files,
      a,
      bytes,
      file.name,
      file.type,
      row.jobId,
    );
    const display = await blob(
      tx,
      files,
      a,
      compressed,
      `${original.id}-display.jpg`,
      "image/jpeg",
      row.jobId,
    );
    const photo = await tx.inspectionPhoto.create({
      data: { ...meta, fileId: display.id, originalFileId: original.id },
    });
    await audit(tx, a, "Inspection", id, "PHOTO_UPLOAD", {
      photoId: photo.id,
      originalFileId: original.id,
      compressedFileId: display.id,
    });
    return photo;
  });
}
export async function checklistTemplates(a: Actor) {
  admin(a);
  return db.templateVersion.findMany({
    where: {
      organizationId: a.organizationId,
      type: { in: ["INSPECTION", "DRYER_VENT_REPORT"] },
      active: true,
    },
  });
}
export async function saveChecklist(a: Actor, raw: unknown) {
  admin(a);
  const data = z
    .object({
      kind: z.enum(["CHIMNEY", "DRYER_VENT"]),
      checklist: checklistSchema,
    })
    .strict()
    .parse(raw);
  return transaction(async (tx) => {
    const type = data.kind === "CHIMNEY" ? "INSPECTION" : "DRYER_VENT_REPORT";
    const old = await ensureTemplate(tx, a.organizationId, type);
    await tx.templateVersion.updateMany({
      where: { organizationId: a.organizationId, type, active: true },
      data: { active: false },
    });
    const row = await tx.templateVersion.create({
      data: {
        organizationId: a.organizationId,
        type,
        version: old.version + 1,
        source: JSON.stringify({
          ...parseLayout(JSON.parse(old.source)),
          checklist: data.checklist,
        }),
        active: true,
      },
    });
    await audit(tx, a, "TemplateVersion", row.id, "CHECKLIST_CREATE");
    return row;
  });
}
export async function repairs(a: Actor, id: string, raw: unknown) {
  const data = z
    .object({
      findingIds: z.array(z.string()).min(1).max(100),
      prices: z
        .array(
          z
            .object({
              findingId: z.string(),
              unitPriceCents: z.number().int().min(0).max(2147483647),
            })
            .strict(),
        )
        .optional(),
    })
    .strict()
    .parse(raw);
  const row = await readInspection(a, id);
  const findings = row.sections
    .flatMap((s) => s.findings)
    .filter((f) => data.findingIds.includes(f.id));
  if (
    findings.length !== new Set(data.findingIds).size ||
    findings.some((f) => f.status !== "FAIL")
  )
    throw new HttpError(400, "Select only FAIL findings in this inspection.");
  const lines = findings.map((f) => ({
    title: f.title,
    description: [f.observation, f.recommendation].filter(Boolean).join("\n"),
    quantity: "1",
    unit: "each",
    note: `Inspection ${row.document.number}, finding ${f.id}`,
    unitPriceCents: null,
  }));
  if (!data.prices) {
    await transaction((tx) =>
      audit(tx, a, "Inspection", id, "REPAIRS_SELECTED", {
        findingIds: data.findingIds,
      }),
    );
    return { lines };
  }
  office(a);
  const items = lines.map((l, i) => {
    const price = data.prices!.find((p) => p.findingId === findings[i].id);
    if (!price)
      throw new HttpError(
        400,
        "Enter an explicit price for every selected repair.",
      );
    return { ...l, unitPriceCents: price.unitPriceCents };
  });
  return saveEstimate(a, {
    customerId: row.customerId,
    propertyId: row.propertyId,
    jobId: row.jobId,
    lineItems: items,
    validUntil: null,
  });
}
