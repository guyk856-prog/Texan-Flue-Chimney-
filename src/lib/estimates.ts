import { Prisma, EstimateStatus } from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { type Actor, office, jobScope } from "./access";
import { HttpError } from "./errors";
import {
  estimateInput,
  preferencesSchema,
  TAX_CONFIRMATION,
  type EstimateInput,
} from "./estimate-contract";
import { documentTotals, lineTotal } from "./money";
import {
  DEFAULT_ESTIMATE_LAYOUT,
  validateEstimateLayout,
  DISCLAIMERS,
} from "./template-contract";
import { snapshotSchema, type EstimateSnapshot } from "./snapshot";
import { createNumberedDocument } from "./document-number";
import { renderPdf } from "./pdf";
import { newToken } from "./security";
type Tx = Prisma.TransactionClient;
const include = {
  lineItems: {
    orderBy: { sortOrder: "asc" as const },
    include: { service: true },
  },
  customer: true,
  property: true,
  document: {
    include: { versions: { orderBy: { version: "desc" as const } } },
  },
  supersedes: { select: { id: true, document: { select: { number: true } } } },
  supersededBy: {
    select: { id: true, document: { select: { number: true } } },
  },
} satisfies Prisma.EstimateInclude;
export function estimateScope(a: Actor): Prisma.EstimateWhereInput {
  return {
    deletedAt: null,
    document: { organizationId: a.organizationId },
    customer: { deletedAt: null },
    property: { deletedAt: null },
    ...(a.role === "TECHNICIAN" ? { job: { is: jobScope(a) } } : {}),
  };
}
export async function readEstimate(a: Actor, id: string, tx: Tx = db) {
  const row = await tx.estimate.findFirst({
    where: { AND: [estimateScope(a), { id }] },
    include,
  });
  if (!row) throw new HttpError(404, "Estimate not found.");
  return row;
}
export async function listEstimates(a: Actor) {
  return db.estimate.findMany({
    where: estimateScope(a),
    include: {
      customer: { select: { name: true } },
      document: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
async function locked(a: Actor, id: string, tx: Tx) {
  await readEstimate(a, id, tx);
  await tx.$queryRaw`SELECT id FROM "Estimate" WHERE id=${id} FOR UPDATE`;
  return readEstimate(a, id, tx);
}
async function audit(tx: Tx, a: Actor, id: string, action: string) {
  await tx.auditLog.create({
    data: {
      organizationId: a.organizationId,
      userId: a.id,
      entity: "Estimate",
      entityId: id,
      action,
    },
  });
}
function money(
  lines: EstimateInput["lineItems"],
  data: EstimateInput,
  settings: {
    taxEnabled: boolean;
    feeEnabled: boolean;
    taxRateBasisPoints: number;
    feeRateBasisPoints: number;
  },
) {
  if (
    ((settings.taxEnabled && !data.preferences.includeTax) ||
      (settings.feeEnabled && !data.preferences.includeFee)) &&
    !data.preferences.removalConfirmed
  )
    throw new HttpError(400, TAX_CONFIRMATION);
  try {
    return documentTotals(lines, {
      discountCents: data.discountCents,
      depositRequestCents: data.depositRequestCents,
      taxEnabled: settings.taxEnabled && data.preferences.includeTax,
      feeEnabled: settings.feeEnabled && data.preferences.includeFee,
      taxRateBasisPoints: settings.taxRateBasisPoints,
      feeRateBasisPoints: settings.feeRateBasisPoints,
    });
  } catch (e) {
    throw new HttpError(
      400,
      e instanceof Error ? e.message : "Invalid amounts.",
    );
  }
}
async function related(tx: Tx, a: Actor, data: EstimateInput) {
  const customer = await tx.customer.findFirst({
    where: {
      id: data.customerId,
      organizationId: a.organizationId,
      deletedAt: null,
    },
  });
  const property = await tx.property.findFirst({
    where: {
      id: data.propertyId,
      customerId: data.customerId,
      deletedAt: null,
    },
  });
  if (!customer || !property)
    throw new HttpError(404, "Customer or property not found.");
  if (
    data.jobId &&
    !(await tx.job.findFirst({
      where: {
        id: data.jobId,
        organizationId: a.organizationId,
        customerId: data.customerId,
        propertyId: data.propertyId,
        deletedAt: null,
      },
    }))
  )
    throw new HttpError(404, "Job not found.");
}
async function lineRows(tx: Tx, a: Actor, data: EstimateInput) {
  return Promise.all(
    data.lineItems.map(async (line, sortOrder) => {
      const service = line.serviceId
        ? await tx.serviceCatalogItem.findFirst({
            where: {
              id: line.serviceId,
              organizationId: a.organizationId,
              active: true,
            },
          })
        : null;
      if (line.serviceId && !service)
        throw new HttpError(404, "Service not found.");
      if (service?.companyDefinedTerm && !service.scopeSteps.length)
        throw new HttpError(
          400,
          "Company-defined services require explicit scope.",
        );
      return {
        ...line,
        serviceId: line.serviceId ?? null,
        title: service?.companyDefinedTerm ? service.title : line.title,
        sortOrder,
        lineTotalCents: lineTotal(line),
      };
    }),
  );
}
async function template(tx: Tx, organizationId: string) {
  let row = await tx.templateVersion.findFirst({
    where: { organizationId, type: "ESTIMATE", active: true },
    orderBy: { version: "desc" },
  });
  if (!row) {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${organizationId} FOR UPDATE`;
    row = await tx.templateVersion.findFirst({
      where: { organizationId, type: "ESTIMATE", active: true },
      orderBy: { version: "desc" },
    });
    if (!row)
      row = await tx.templateVersion.create({
        data: {
          organizationId,
          type: "ESTIMATE",
          version: 1,
          active: true,
          source: JSON.stringify(DEFAULT_ESTIMATE_LAYOUT),
        },
      });
  }
  return row;
}
function inputFromRow(
  row: Awaited<ReturnType<typeof readEstimate>>,
): EstimateInput {
  const preferences = preferencesSchema.parse(
    (row.document.versions[0].snapshot as { preferences: unknown }).preferences,
  );
  return estimateInput.parse({
    customerId: row.customerId,
    propertyId: row.propertyId,
    jobId: row.jobId,
    lineItems: row.lineItems.map((line) => ({
      serviceId: line.serviceId,
      title: line.title,
      description: line.description ?? "",
      quantity: line.quantity.toFixed(2),
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      discountCents: line.discountCents,
      taxable: line.taxable,
      note: line.note ?? "",
    })),
    discountCents: row.discountCents,
    depositRequestCents: row.depositRequestCents,
    terms: row.terms ?? "",
    exclusions: row.exclusions ?? "",
    assumptions: row.assumptions ?? "",
    warrantyTerms: row.warrantyTerms ?? "",
    customerNote: row.customerNote ?? "",
    internalNote: row.internalNote ?? "",
    validUntil: row.validUntil?.toISOString().slice(0, 10) ?? null,
    preferences,
  });
}
export { inputFromRow };
async function buildSnapshot(
  tx: Tx,
  a: Actor,
  id: string,
  preferences: EstimateInput["preferences"],
  issuedAt: string | null = null,
): Promise<EstimateSnapshot> {
  const row = await readEstimate(a, id, tx);
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: a.organizationId },
    include: { settings: true },
  });
  if (!org.settings)
    throw new HttpError(400, "Organization settings are required.");
  const t = await template(tx, a.organizationId);
  const layout = validateEstimateLayout(JSON.parse(t.source));
  const data = inputFromRow(row);
  data.preferences = preferences;
  const totals = money(data.lineItems, data, org.settings);
  const footer = layout.blocks.find((b) => b.type === "footer");
  return snapshotSchema.parse({
    schemaVersion: 1,
    templateVersionId: t.id,
    template: layout,
    document: {
      id: row.documentId,
      number: row.document.number,
      type: "ESTIMATE",
      version: 1,
      status: issuedAt ? "ISSUED" : "DRAFT",
      issuedAt,
      validUntil: row.validUntil?.toISOString() ?? null,
      revisionOf: row.supersedes?.document.number ?? null,
    },
    organization: org,
    customer: row.customer,
    property: row.property,
    lines: row.lineItems.map((l) => ({
      serviceId: l.serviceId,
      title: l.service?.companyDefinedTerm ? l.service.title : l.title,
      description: l.description ?? "",
      quantity: l.quantity.toFixed(2),
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      discountCents: l.discountCents,
      taxable: l.taxable,
      lineTotalCents: lineTotal({ ...l, quantity: l.quantity.toFixed(2) }),
      note: l.note ?? "",
      companyDefinedTerm: l.service?.companyDefinedTerm ?? false,
      scopeSteps: l.service?.companyDefinedTerm ? l.service.scopeSteps : [],
    })),
    totals,
    tax: {
      enabled: org.settings.taxEnabled && preferences.includeTax,
      label: org.settings.taxLabel,
      rateBasisPoints: org.settings.taxRateBasisPoints,
    },
    fee: {
      enabled: org.settings.feeEnabled && preferences.includeFee,
      label: org.settings.feeLabel,
      rateBasisPoints: org.settings.feeRateBasisPoints,
    },
    preferences,
    terms: row.terms ?? "",
    exclusions: row.exclusions ?? "",
    assumptions: row.assumptions ?? "",
    warrantyTerms: row.warrantyTerms ?? "",
    customerNote: row.customerNote ?? "",
    disclaimer: DISCLAIMERS.estimate,
    footerCopy: footer?.type === "footer" ? (footer.options.copy ?? "") : "",
  });
}
async function writeDraft(tx: Tx, a: Actor, data: EstimateInput, id?: string) {
  await related(tx, a, data);
  const settings = await tx.organizationSettings.findUniqueOrThrow({
    where: { organizationId: a.organizationId },
  });
  const totals = money(data.lineItems, data, settings);
  const rows = await lineRows(tx, a, data);
  const { lineItems, preferences, validUntil, ...fields } = data;
  void lineItems;
  let row;
  if (id) {
    const old = await locked(a, id, tx);
    if (old.status !== "DRAFT" || old.document.versions.some((v) => v.issuedAt))
      throw new HttpError(
        409,
        "Only unissued DRAFT estimates can be edited. Create a revision instead.",
      );
    row = await tx.estimate.update({
      where: { id },
      data: {
        ...fields,
        ...totals,
        validUntil: validUntil ? new Date(validUntil) : null,
        lineItems: { deleteMany: {}, create: rows },
      },
    });
  } else {
    const document = await createNumberedDocument(
      tx,
      a.organizationId,
      "ESTIMATE",
    );
    row = await tx.estimate.create({
      data: {
        ...fields,
        ...totals,
        documentId: document.id,
        validUntil: validUntil ? new Date(validUntil) : null,
        lineItems: { create: rows },
      },
    });
    // A draft version stores document-specific tax/fee choices without schema changes.
    await tx.documentVersion.create({
      data: { documentId: document.id, version: 1, snapshot: { preferences } },
    });
  }
  const snapshot = await buildSnapshot(tx, a, row.id, preferences);
  await tx.documentVersion.update({
    where: { documentId_version: { documentId: row.documentId, version: 1 } },
    data: {
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      templateVersionId: snapshot.templateVersionId,
    },
  });
  await audit(tx, a, row.id, id ? "DRAFT_UPDATE" : "DRAFT_CREATE");
  return readEstimate(a, row.id, tx);
}
export async function saveEstimate(a: Actor, raw: unknown, id?: string) {
  office(a);
  const data = estimateInput.parse(raw);
  return db.$transaction((tx) => writeDraft(tx, a, data, id), {
    timeout: 30000,
  });
}
export async function issueEstimate(a: Actor, id: string) {
  office(a);
  let stored: string | undefined;
  try {
    return await db.$transaction(
      async (tx) => {
        const row = await locked(a, id, tx);
        if (
          row.status !== "DRAFT" ||
          row.document.versions.some((v) => v.issuedAt)
        )
          throw new HttpError(409, "Estimate has already been issued.");
        const prefs = preferencesSchema.parse(
          (row.document.versions[0].snapshot as { preferences: unknown })
            .preferences,
        );
        const stamp = new Date();
        const snapshot = await buildSnapshot(
          tx,
          a,
          id,
          prefs,
          stamp.toISOString(),
        );
        const pdf = await renderPdf(snapshot);
        const dir = path.resolve(
          /* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_DIR ??
            "./private/uploads",
        );
        if (
          dir === path.resolve("public") ||
          dir.startsWith(path.resolve("public") + path.sep)
        )
          throw new Error("Storage must be private");
        await mkdir(dir, { recursive: true, mode: 0o700 });
        const key = newToken();
        stored = path.join(/* turbopackIgnore: true */ dir, key);
        await writeFile(stored, pdf, { flag: "wx", mode: 0o600 });
        const contentHash = createHash("sha256").update(pdf).digest("hex");
        const file = await tx.fileAsset.create({
          data: {
            storageKey: key,
            filename: `${snapshot.document.number}.pdf`,
            mimeType: "application/pdf",
            sizeBytes: pdf.length,
            sha256: contentHash,
            uploadedById: a.id,
            ...(row.jobId ? { jobPhotos: { connect: { id: row.jobId } } } : {}),
          },
        });
        await tx.documentVersion.update({
          where: {
            documentId_version: { documentId: row.documentId, version: 1 },
          },
          data: {
            snapshot: JSON.parse(JSON.stringify(snapshot)),
            templateVersionId: snapshot.templateVersionId,
            pdfFileId: file.id,
            contentHash,
            issuedAt: stamp,
          },
        });
        await tx.document.update({
          where: { id: row.documentId },
          data: { currentVersion: 1 },
        });
        await tx.estimate.update({
          where: { id },
          data: { ...snapshot.totals, status: "READY" },
        });
        await audit(tx, a, id, "ISSUE");
        return readEstimate(a, id, tx);
      },
      { timeout: 90000, maxWait: 30000 },
    );
  } catch (e) {
    if (stored) await unlink(stored).catch(() => {});
    throw e;
  }
}
export async function previewEstimate(a: Actor, id: string) {
  const row = await readEstimate(a, id);
  const snapshot = snapshotSchema.parse(row.document.versions[0].snapshot);
  return { pdf: await renderPdf(snapshot), snapshot };
}
export async function duplicateEstimate(a: Actor, id: string, revise = false) {
  office(a);
  return db.$transaction(
    async (tx) => {
      const old = await locked(a, id, tx);
      if (
        revise &&
        (!old.document.versions.some((v) => v.issuedAt) ||
          old.status === "SUPERSEDED")
      )
        throw new HttpError(
          409,
          "Only a current issued estimate can be revised.",
        );
      const fresh = await writeDraft(tx, a, inputFromRow(old));
      if (revise) {
        await tx.estimate.update({
          where: { id: old.id },
          data: { status: "SUPERSEDED", supersededById: fresh.id },
        });
        const snapshot = await buildSnapshot(
          tx,
          a,
          fresh.id,
          inputFromRow(fresh).preferences,
        );
        await tx.documentVersion.update({
          where: {
            documentId_version: { documentId: fresh.documentId, version: 1 },
          },
          data: { snapshot: JSON.parse(JSON.stringify(snapshot)) },
        });
        await audit(tx, a, old.id, "REVISE");
      }
      return readEstimate(a, fresh.id, tx);
    },
    { timeout: 30000 },
  );
}
const transitions: Record<EstimateStatus, EstimateStatus[]> = {
  DRAFT: [],
  READY: ["SENT", "EXPIRED"],
  SENT: ["VIEWED", "DECLINED", "EXPIRED"],
  VIEWED: ["APPROVED", "DECLINED", "EXPIRED"],
  APPROVED: [],
  DECLINED: [],
  EXPIRED: [],
  SUPERSEDED: [],
};
export async function setEstimateStatus(a: Actor, id: string, raw: unknown) {
  office(a);
  const data = z
    .object({
      status: z.enum(EstimateStatus),
      declineReason: z.string().max(10000).optional(),
    })
    .strict()
    .parse(raw);
  return db.$transaction(async (tx) => {
    const row = await locked(a, id, tx);
    if (
      !row.document.versions[0].issuedAt ||
      !transitions[row.status].includes(data.status)
    )
      throw new HttpError(409, "Invalid estimate status transition.");
    if (
      data.status === "EXPIRED" &&
      (!row.validUntil || row.validUntil > new Date())
    )
      throw new HttpError(409, "Estimate validity date has not elapsed.");
    const stamp = new Date();
    await tx.estimate.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.status === "SENT" ? { sentAt: stamp } : {}),
        ...(data.status === "APPROVED" ? { approvedAt: stamp } : {}),
        ...(data.status === "DECLINED"
          ? { declinedAt: stamp, declineReason: data.declineReason ?? null }
          : {}),
      },
    });
    await audit(tx, a, id, `STATUS_${data.status}`);
    return readEstimate(a, id, tx);
  });
}
export async function templates(a: Actor) {
  return db.templateVersion.findMany({
    where: { organizationId: a.organizationId, type: "ESTIMATE" },
    orderBy: { version: "desc" },
  });
}
export async function saveTemplate(a: Actor, raw: unknown) {
  if (a.role !== "ADMIN")
    throw new HttpError(403, "Administrator access required.");
  let layout;
  try {
    layout = validateEstimateLayout(raw);
  } catch (e) {
    throw new HttpError(
      400,
      e instanceof Error ? e.message : "Invalid template.",
    );
  }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${a.organizationId} FOR UPDATE`;
    const last = await tx.templateVersion.findFirst({
      where: { organizationId: a.organizationId, type: "ESTIMATE" },
      orderBy: { version: "desc" },
    });
    await tx.templateVersion.updateMany({
      where: {
        organizationId: a.organizationId,
        type: "ESTIMATE",
        active: true,
      },
      data: { active: false },
    });
    return tx.templateVersion.create({
      data: {
        organizationId: a.organizationId,
        type: "ESTIMATE",
        version: (last?.version ?? 0) + 1,
        active: true,
        source: JSON.stringify(layout),
      },
    });
  });
}

export function defaultValidUntil(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
