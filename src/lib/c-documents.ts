import { logoData } from "./brand";
import { layoutFor } from "./document-layouts";
import { Prisma, DocumentType } from "@prisma/client";
import { createHash } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { type Actor, office, jobScope } from "./access";
import { createNumberedDocument } from "./document-number";
import { DISCLAIMERS, parseLayout } from "./template-contract";
import { snapshotSchema, type EstimateSnapshot } from "./snapshot";
import { renderPdf } from "./pdf";
import { newToken } from "./security";
import { HttpError } from "./errors";
import { CHIMNEY_CHECKLIST, DRYER_CHECKLIST } from "./checklists";
export type Tx = Prisma.TransactionClient;
export const TX_OPTIONS = { timeout: 180000, maxWait: 30000 };
export const json = (value: unknown) => JSON.parse(JSON.stringify(value));
export async function audit(
  tx: Tx,
  a: Actor,
  entity: string,
  id: string,
  action: string,
  after?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: {
      organizationId: a.organizationId,
      userId: a.id,
      entity,
      entityId: id,
      action,
      ...(after ? { after } : {}),
    },
  });
}
export function privateDirectory() {
  const dir = path.resolve(
    /* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_DIR ??
      "./private/uploads",
  );
  if (
    dir === path.resolve("public") ||
    dir.startsWith(path.resolve("public") + path.sep)
  )
    throw new Error("Storage must be private");
  return dir;
}
export async function storedBytes(key: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(key))
    throw new HttpError(404, "File not found.");
  return readFile(
    path.join(/* turbopackIgnore: true */ privateDirectory(), key),
  );
}
export async function transaction<T>(
  work: (tx: Tx, files: string[]) => Promise<T>,
): Promise<T> {
  const files: string[] = [];
  try {
    return await db.$transaction((tx) => work(tx, files), TX_OPTIONS);
  } catch (e) {
    await Promise.all(files.map((file) => unlink(file).catch(() => {})));
    throw e;
  }
}
export async function blob(
  tx: Tx,
  files: string[],
  a: Actor,
  bytes: Buffer,
  filename: string,
  mimeType: string,
  jobId?: string | null,
) {
  await mkdir(privateDirectory(), { recursive: true, mode: 0o700 });
  const storageKey = newToken();
  const file = path.join(
    /* turbopackIgnore: true */ privateDirectory(),
    storageKey,
  );
  await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  files.push(file);
  return tx.fileAsset.create({
    data: {
      storageKey,
      filename,
      mimeType,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedById: a.id,
      ...(jobId ? { jobPhotos: { connect: { id: jobId } } } : {}),
    },
  });
}
export async function ensureTemplate(
  tx: Tx,
  organizationId: string,
  type: DocumentType,
) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${organizationId} FOR UPDATE`;
  let row = await tx.templateVersion.findFirst({
    where: { organizationId, type, active: true },
    orderBy: { version: "desc" },
  });
  if (!row) {
    const last = await tx.templateVersion.findFirst({
      where: { organizationId, type },
      orderBy: { version: "desc" },
    });
    const source = {
      ...layoutFor(type),
      ...(type === "INSPECTION" || type === "DRYER_VENT_REPORT"
        ? {
            checklist:
              type === "INSPECTION" ? CHIMNEY_CHECKLIST : DRYER_CHECKLIST,
          }
        : {}),
    };
    row = await tx.templateVersion.create({
      data: {
        organizationId,
        type,
        version: (last?.version ?? 0) + 1,
        active: true,
        source: JSON.stringify(source),
      },
    });
  }
  return row;
}
export async function baseSnapshot(
  tx: Tx,
  a: Actor,
  document: { id: string; number: string; type: DocumentType },
  customerId: string,
  propertyId: string,
) {
  const [org, customer, property, t] = await Promise.all([
    tx.organization.findUniqueOrThrow({ where: { id: a.organizationId } }),
    tx.customer.findFirst({
      where: {
        id: customerId,
        organizationId: a.organizationId,
        deletedAt: null,
      },
    }),
    tx.property.findFirst({
      where: { id: propertyId, customerId, deletedAt: null },
    }),
    ensureTemplate(tx, a.organizationId, document.type),
  ]);
  if (!customer || !property)
    throw new HttpError(404, "Customer or property not found.");
  const type = document.type as EstimateSnapshot["document"]["type"];
  const disclaimer =
    type === "INVOICE"
      ? DISCLAIMERS.invoice
      : type === "RECEIPT"
        ? DISCLAIMERS.receipt
        : type === "INSPECTION" || type === "DRYER_VENT_REPORT"
          ? DISCLAIMERS.inspection
          : DISCLAIMERS.estimate;
  return snapshotSchema.parse({
    schemaVersion: 1,
    templateVersionId: t.id,
    template: parseLayout(JSON.parse(t.source)),
    document: {
      id: document.id,
      number: document.number,
      type,
      version: 1,
      status: "DRAFT",
      issuedAt: null,
      validUntil: null,
      revisionOf: null,
    },
    organization: { ...org, logoData: await logoData() },
    customer,
    property,
    lines: [],
    totals: {
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      feeCents: 0,
      totalCents: 0,
      depositRequestCents: 0,
    },
    tax: { enabled: false, label: "Tax", rateBasisPoints: 0 },
    fee: { enabled: false, label: "Service Fee", rateBasisPoints: 0 },
    preferences: {
      includeTax: false,
      includeFee: false,
      removalConfirmed: true,
    },
    terms: "",
    exclusions: "",
    assumptions: "",
    warrantyTerms: "",
    customerNote: "",
    disclaimer,
    footerCopy: "",
  });
}
export async function freeze(
  tx: Tx,
  files: string[],
  a: Actor,
  raw: EstimateSnapshot,
  jobId?: string | null,
) {
  const snapshot = snapshotSchema.parse(raw);
  const document = await tx.document.findFirst({
    where: { id: snapshot.document.id, organizationId: a.organizationId },
  });
  if (!document) throw new HttpError(404, "Document not found.");
  await tx.$queryRaw`SELECT id FROM "Document" WHERE id=${document.id} FOR UPDATE`;
  const last = await tx.documentVersion.findFirst({
    where: { documentId: document.id },
    orderBy: { version: "desc" },
  });
  const version =
    last && !last.issuedAt ? last.version : (last?.version ?? 0) + 1;
  snapshot.document.version = version;
  snapshot.document.issuedAt = new Date().toISOString();
  const pdf = await renderPdf(snapshot);
  const file = await blob(
    tx,
    files,
    a,
    pdf,
    `${document.number}-v${version}.pdf`,
    "application/pdf",
    jobId,
  );
  const data = {
    snapshot: json(snapshot),
    issuedAt: new Date(snapshot.document.issuedAt),
    templateVersionId: snapshot.templateVersionId,
    pdfFileId: file.id,
    contentHash: file.sha256,
  };
  const row =
    last && !last.issuedAt
      ? await tx.documentVersion.update({ where: { id: last.id }, data })
      : await tx.documentVersion.create({
          data: { documentId: document.id, version, ...data },
        });
  await tx.document.update({
    where: { id: document.id },
    data: { currentVersion: version },
  });
  return row;
}
export async function docAccess(a: Actor, id: string) {
  const row = await db.document.findFirst({
    where: { id, organizationId: a.organizationId },
    include: {
      estimate: true,
      invoice: true,
      inspection: true,
      receipt: { include: { invoice: true } },
    },
  });
  if (!row) throw new HttpError(404, "Document not found.");
  let jobId: string | null = null;
  const resource =
    row.estimate ?? row.invoice ?? row.inspection ?? row.receipt?.invoice;
  if (resource) {
    if (resource.deletedAt) throw new HttpError(404, "Document not found.");
    jobId = resource.jobId;
    const customer = await db.customer.findFirst({
      where: { id: resource.customerId, deletedAt: null },
    });
    const property = await db.property.findFirst({
      where: { id: resource.propertyId, deletedAt: null },
    });
    if (!customer || !property) throw new HttpError(404, "Document not found.");
  }
  if (
    a.role === "TECHNICIAN" &&
    (!jobId ||
      !(await db.job.findFirst({
        where: { AND: [jobScope(a), { id: jobId }] },
      })))
  )
    throw new HttpError(404, "Document not found.");
  return row;
}
export { createNumberedDocument, office };
