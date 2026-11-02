import { logoData } from "./brand";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { type Actor, jobScope, office } from "./access";
import { HttpError } from "./errors";
import { estimateInput } from "./estimate-contract";
import { documentTotals, lineTotal, cents } from "./money";
import { readEstimate } from "./estimates";
import { snapshotSchema, type EstimateSnapshot } from "./snapshot";
import { DISCLAIMERS } from "./template-contract";
import {
  transaction,
  audit,
  json,
  baseSnapshot,
  freeze,
  ensureTemplate,
  createNumberedDocument,
  type Tx,
} from "./c-documents";
import { parseLayout } from "./template-contract";
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(100);
const text = z.string().trim().max(10000);
export const invoiceInput = z
  .object({
    sourceEstimateId: id.optional(),
    draft: estimateInput.optional(),
    dueDate: z.iso.date(),
    paymentInstructions: text.default(""),
    notes: text.default(""),
  })
  .strict()
  .refine(
    (v) => !!v.sourceEstimateId !== !!v.draft,
    "Choose an approved estimate OR a scratch draft.",
  );
export function todayDallas(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function invoiceState(
  row: {
    voidedAt: Date | null;
    issueDate: Date | null;
    dueDate: Date | null;
    totalCents: number;
  },
  paid: number,
  shared = false,
  today = todayDallas(),
): InvoiceStatus {
  if (row.voidedAt) return "VOID";
  if (!row.issueDate) return "DRAFT";
  if (paid === row.totalCents) return "PAID";
  if (row.dueDate && row.dueDate.toISOString().slice(0, 10) < today)
    return "OVERDUE";
  if (paid > 0) return "PARTIALLY_PAID";
  return shared ? "SENT" : "ISSUED";
}
export function invoiceScope(a: Actor): Prisma.InvoiceWhereInput {
  return {
    deletedAt: null,
    document: { organizationId: a.organizationId },
    customer: { deletedAt: null },
    property: { deletedAt: null },
    ...(a.role === "TECHNICIAN" ? { job: { is: jobScope(a) } } : {}),
  };
}
const include = {
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  payments: {
    include: { receipt: true },
    orderBy: { createdAt: "asc" as const },
  },
  customer: true,
  property: true,
  document: {
    include: {
      versions: { orderBy: { version: "desc" as const } },
      shareTokens: { select: { id: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;
export async function readInvoice(a: Actor, id: string, tx: Tx = db) {
  const row = await tx.invoice.findFirst({
    where: { AND: [invoiceScope(a), { id }] },
    include,
  });
  if (!row) throw new HttpError(404, "Invoice not found.");
  const paid = cents(
    row.payments
      .filter((p) => !p.reversedAt)
      .reduce((s, p) => s + BigInt(p.amountCents), 0n),
  );
  return {
    ...row,
    amountPaidCents: paid,
    balanceCents: cents(BigInt(row.totalCents) - BigInt(paid)),
    status: invoiceState(row, paid, row.document.shareTokens.length > 0),
  };
}
export async function listInvoices(a: Actor) {
  const rows = await db.invoice.findMany({
    where: invoiceScope(a),
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return Promise.all(rows.map((r) => readInvoice(a, r.id)));
}
async function lockInvoice(tx: Tx, a: Actor, id: string) {
  await readInvoice(a, id, tx);
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${id} FOR UPDATE`;
  return readInvoice(a, id, tx);
}
export async function createInvoice(a: Actor, raw: unknown, id?: string) {
  office(a);
  const data = invoiceInput.parse(raw);
  return transaction(async (tx) => {
    const existing = id ? await lockInvoice(tx, a, id) : null;
    if (
      existing &&
      (existing.issueDate ||
        existing.voidedAt ||
        existing.sourceEstimateId ||
        data.sourceEstimateId)
    )
      throw new HttpError(
        409,
        "Only scratch DRAFT invoices can be edited. Converted approved amounts are preserved.",
      );
    let snapshot: EstimateSnapshot,
      sourceId: string | undefined,
      customerId: string,
      propertyId: string,
      jobId: string | null;
    if (data.sourceEstimateId) {
      const e = await readEstimate(a, data.sourceEstimateId, tx);
      await tx.$queryRaw`SELECT id FROM "Estimate" WHERE id=${e.id} FOR UPDATE`;
      const source = await readEstimate(a, e.id, tx);
      if (source.status !== "APPROVED")
        throw new HttpError(409, "Only approved estimates can be converted.");
      const version = source.document.versions.find((v) => v.issuedAt);
      if (!version)
        throw new HttpError(409, "Approved estimate has no issued version.");
      snapshot = snapshotSchema.parse(version.snapshot);
      sourceId = source.id;
      customerId = source.customerId;
      propertyId = source.propertyId;
      jobId = source.jobId;
    } else {
      const d = data.draft!;
      customerId = d.customerId;
      propertyId = d.propertyId;
      jobId = d.jobId ?? null;
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: a.organizationId },
      });
      if (
        ((settings.taxEnabled && !d.preferences.includeTax) ||
          (settings.feeEnabled && !d.preferences.includeFee)) &&
        !d.preferences.removalConfirmed
      )
        throw new HttpError(
          400,
          "Removing tax or a service fee from this document does not determine what is actually owed.",
        );
      let totals;
      try {
        totals = documentTotals(d.lineItems, {
          ...d,
          ...settings,
          taxEnabled: settings.taxEnabled && d.preferences.includeTax,
          feeEnabled: settings.feeEnabled && d.preferences.includeFee,
        });
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid money.",
        );
      }
      if (
        jobId &&
        !(await tx.job.findFirst({
          where: {
            id: jobId,
            organizationId: a.organizationId,
            customerId,
            propertyId,
            deletedAt: null,
          },
        }))
      )
        throw new HttpError(404, "Job not found.");
      const temp = existing
        ? existing.document
        : await createNumberedDocument(tx, a.organizationId, "INVOICE");
      snapshot = await baseSnapshot(tx, a, temp, customerId, propertyId);
      snapshot.lines = await Promise.all(
        d.lineItems.map(async (l) => {
          const service = l.serviceId
            ? await tx.serviceCatalogItem.findFirst({
                where: {
                  id: l.serviceId,
                  organizationId: a.organizationId,
                  active: true,
                },
              })
            : null;
          if (l.serviceId && !service)
            throw new HttpError(404, "Service not found.");
          if (service?.companyDefinedTerm && !service.scopeSteps.length)
            throw new HttpError(
              400,
              "Explicit company-defined scope required.",
            );
          return {
            ...l,
            serviceId: l.serviceId ?? null,
            title: service?.companyDefinedTerm ? service.title : l.title,
            lineTotalCents: lineTotal(l),
            companyDefinedTerm: service?.companyDefinedTerm ?? false,
            scopeSteps: service?.companyDefinedTerm ? service.scopeSteps : [],
          };
        }),
      );
      Object.assign(snapshot, {
        totals,
        terms: d.terms,
        exclusions: d.exclusions,
        assumptions: d.assumptions,
        warrantyTerms: d.warrantyTerms,
        customerNote: d.customerNote,
        preferences: d.preferences,
        tax: {
          enabled: settings.taxEnabled && d.preferences.includeTax,
          label: settings.taxLabel,
          rateBasisPoints: settings.taxRateBasisPoints,
        },
        fee: {
          enabled: settings.feeEnabled && d.preferences.includeFee,
          label: settings.feeLabel,
          rateBasisPoints: settings.feeRateBasisPoints,
        },
      });
    }
    const document = sourceId
      ? await createNumberedDocument(tx, a.organizationId, "INVOICE")
      : await tx.document.findUniqueOrThrow({
          where: { id: snapshot.document.id },
        });
    const t = await ensureTemplate(tx, a.organizationId, "INVOICE");
    snapshot = {
      ...snapshot,
      document: {
        id: document.id,
        number: document.number,
        type: "INVOICE",
        version: 1,
        status: "DRAFT",
        issuedAt: null,
        validUntil: null,
        revisionOf: sourceId ? snapshot.document.number : null,
      },
      organization: { ...snapshot.organization, logoData: await logoData() },
      templateVersionId: t.id,
      template: parseLayout(JSON.parse(t.source)),
      disclaimer: DISCLAIMERS.invoice,
      footerCopy: "",
      paymentInstructions: data.paymentInstructions,
      financial: {
        amountPaidCents: 0,
        balanceCents: snapshot.totals.totalCents,
        issueDate: null,
        dueDate: data.dueDate,
        status: "DRAFT",
      },
    };
    delete snapshot.signature;
    delete snapshot.certificate;
    const { depositRequestCents, ...invoiceTotals } = snapshot.totals;
    void depositRequestCents;
    const fields = {
      documentId: document.id,
      customerId,
      propertyId,
      jobId,
      sourceEstimateId: sourceId,
      ...invoiceTotals,
      amountPaidCents: 0,
      balanceCents: snapshot.totals.totalCents,
      dueDate: new Date(data.dueDate),
      paymentInstructions: data.paymentInstructions,
      notes: data.notes,
      lineItems: {
        create: snapshot.lines.map((l, sortOrder) => ({
          sortOrder,
          title: l.title,
          description: [
            l.description,
            ...(l.companyDefinedTerm
              ? [
                  "Company-defined cleaning term; not an NFPA inspection level.",
                  ...l.scopeSteps,
                ]
              : []),
          ]
            .filter(Boolean)
            .join("\n"),
          quantity: l.quantity,
          unit: l.unit,
          unitPriceCents: l.unitPriceCents,
          discountCents: l.discountCents,
          taxable: l.taxable,
          lineTotalCents: l.lineTotalCents,
        })),
      },
    };
    const invoice = existing
      ? await tx.invoice.update({
          where: { id: existing.id },
          data: {
            ...fields,
            lineItems: { deleteMany: {}, ...fields.lineItems },
          },
        })
      : await tx.invoice.create({ data: fields });
    if (existing)
      await tx.documentVersion.update({
        where: { id: existing.document.versions[0].id },
        data: { snapshot: json(snapshot), templateVersionId: t.id },
      });
    else
      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          version: 1,
          snapshot: json(snapshot),
          templateVersionId: t.id,
        },
      });
    await audit(tx, a, "Invoice", invoice.id, existing ? "UPDATE" : "CREATE");
    return readInvoice(a, invoice.id, tx);
  });
}
export async function issueInvoice(a: Actor, id: string) {
  office(a);
  return transaction(async (tx, files) => {
    const row = await lockInvoice(tx, a, id);
    if (row.issueDate || row.voidedAt)
      throw new HttpError(409, "Invoice is already issued or void.");
    const date = new Date();
    const snapshot = snapshotSchema.parse(row.document.versions[0].snapshot);
    if (!row.sourceEstimateId) {
      const fresh = await baseSnapshot(
        tx,
        a,
        row.document,
        row.customerId,
        row.propertyId,
      );
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: a.organizationId },
      });
      if (
        ((settings.taxEnabled && !snapshot.preferences.includeTax) ||
          (settings.feeEnabled && !snapshot.preferences.includeFee)) &&
        !snapshot.preferences.removalConfirmed
      )
        throw new HttpError(
          400,
          "Removing tax or a service fee from this document does not determine what is actually owed.",
        );
      try {
        snapshot.totals = documentTotals(snapshot.lines, {
          ...snapshot.totals,
          ...settings,
          taxEnabled: settings.taxEnabled && snapshot.preferences.includeTax,
          feeEnabled: settings.feeEnabled && snapshot.preferences.includeFee,
        });
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid amounts.",
        );
      }
      Object.assign(snapshot, {
        customer: fresh.customer,
        property: fresh.property,
        organization: fresh.organization,
        template: fresh.template,
        templateVersionId: fresh.templateVersionId,
        tax: {
          enabled: settings.taxEnabled && snapshot.preferences.includeTax,
          label: settings.taxLabel,
          rateBasisPoints: settings.taxRateBasisPoints,
        },
        fee: {
          enabled: settings.feeEnabled && snapshot.preferences.includeFee,
          label: settings.feeLabel,
          rateBasisPoints: settings.feeRateBasisPoints,
        },
      });
    }
    const { depositRequestCents, ...totals } = snapshot.totals;
    void depositRequestCents;
    await tx.invoice.update({
      where: { id },
      data: {
        ...totals,
        balanceCents: totals.totalCents,
        issueDate: date,
        status: "ISSUED",
      },
    });
    snapshot.document.status = "ISSUED";
    snapshot.financial = {
      amountPaidCents: 0,
      balanceCents: snapshot.totals.totalCents,
      issueDate: date.toISOString(),
      dueDate: row.dueDate?.toISOString() ?? null,
      status: invoiceState(
        { ...row, totalCents: snapshot.totals.totalCents, issueDate: date },
        0,
      ),
    };
    await freeze(tx, files, a, snapshot, row.jobId);
    await audit(tx, a, "Invoice", id, "ISSUE");
    return readInvoice(a, id, tx);
  });
}
async function ledger(tx: Tx, files: string[], a: Actor, id: string) {
  const row = await readInvoice(a, id, tx);
  await tx.invoice.update({
    where: { id },
    data: {
      amountPaidCents: row.amountPaidCents,
      balanceCents: row.balanceCents,
      status: row.status,
    },
  });
  const snapshot = snapshotSchema.parse(row.document.versions[0].snapshot);
  snapshot.document.status = row.status;
  snapshot.financial = {
    amountPaidCents: row.amountPaidCents,
    balanceCents: row.balanceCents,
    issueDate: row.issueDate?.toISOString() ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
    status: row.status,
  };
  if (row.voidedAt) snapshot.customerNote = `VOID: ${row.voidReason}`;
  await freeze(tx, files, a, snapshot, row.jobId);
  return row;
}
export const paymentInput = z
  .object({
    amountCents: z.number().int().min(1).max(2147483647),
    method: z.enum(["CASH", "CHECK", "ZELLE", "BANK_TRANSFER", "OTHER"]),
    paidAt: z.iso.datetime({ offset: true }),
    reference: text.default(""),
    note: text.default(""),
    received: z.literal(true),
  })
  .strict();
export async function recordPayment(a: Actor, id: string, raw: unknown) {
  office(a);
  const data = paymentInput.parse(raw);
  if (new Date(data.paidAt) > new Date())
    throw new HttpError(400, "Payment date cannot be in the future.");
  return transaction(async (tx, files) => {
    const row = await lockInvoice(tx, a, id);
    if (!row.issueDate || row.voidedAt)
      throw new HttpError(409, "Payments require a non-void issued invoice.");
    if (data.amountCents > row.balanceCents)
      throw new HttpError(400, "Payment exceeds the outstanding balance.");
    const { received, ...fields } = data;
    void received;
    const payment = await tx.paymentRecord.create({
      data: {
        ...fields,
        paidAt: new Date(data.paidAt),
        invoiceId: id,
        recordedById: a.id,
      },
    });
    const updated = await ledger(tx, files, a, id);
    const document = await createNumberedDocument(
      tx,
      a.organizationId,
      "RECEIPT",
    );
    const invoiceSnapshot = snapshotSchema.parse(
      row.document.versions[0].snapshot,
    );
    const t = await ensureTemplate(tx, a.organizationId, "RECEIPT");
    const snapshot: EstimateSnapshot = {
      ...invoiceSnapshot,
      document: {
        ...invoiceSnapshot.document,
        id: document.id,
        number: document.number,
        type: "RECEIPT",
        version: 1,
        status: "RECEIPT",
        issuedAt: null,
      },
      templateVersionId: t.id,
      template: parseLayout(JSON.parse(t.source)),
      disclaimer: DISCLAIMERS.receipt,
      receipt: {
        paymentId: payment.id,
        invoiceNumber: row.document.number,
        amountCents: payment.amountCents,
        method: payment.method,
        paidAt: payment.paidAt.toISOString(),
        reference: payment.reference ?? "",
        note: payment.note ?? "",
        balanceAfterCents: updated.balanceCents,
        voidReason: null,
      },
      financial: {
        amountPaidCents: updated.amountPaidCents,
        balanceCents: updated.balanceCents,
        issueDate: row.issueDate?.toISOString() ?? null,
        dueDate: row.dueDate?.toISOString() ?? null,
        status: updated.status,
      },
    };
    delete snapshot.signature;
    const receipt = await tx.receipt.create({
      data: {
        documentId: document.id,
        paymentId: payment.id,
        invoiceId: id,
        balanceAfterCents: updated.balanceCents,
      },
    });
    await freeze(tx, files, a, snapshot, row.jobId);
    await audit(tx, a, "PaymentRecord", payment.id, "RECORD", {
      invoiceId: id,
      receiptId: receipt.id,
      amountCents: payment.amountCents,
    });
    return { payment, receipt, invoice: await readInvoice(a, id, tx) };
  });
}
export async function reversePayment(
  a: Actor,
  id: string,
  paymentId: string,
  raw: unknown,
) {
  office(a);
  const { reason } = z
    .object({ reason: z.string().trim().min(1).max(4000) })
    .strict()
    .parse(raw);
  return transaction(async (tx, files) => {
    const invoice = await lockInvoice(tx, a, id);
    const payment = await tx.paymentRecord.findFirst({
      where: { id: paymentId, invoiceId: id },
      include: {
        receipt: {
          include: {
            document: {
              include: { versions: { orderBy: { version: "desc" } } },
            },
          },
        },
      },
    });
    if (!payment) throw new HttpError(404, "Payment not found.");
    if (payment.reversedAt)
      throw new HttpError(409, "Payment is already reversed.");
    await tx.paymentRecord.update({
      where: { id: paymentId },
      data: { reversedAt: new Date(), reversedReason: reason },
    });
    await ledger(tx, files, a, id);
    if (payment.receipt) {
      const snapshot = snapshotSchema.parse(
        payment.receipt.document.versions[0].snapshot,
      );
      snapshot.document.status = "VOID";
      snapshot.receipt!.voidReason = reason;
      await freeze(tx, files, a, snapshot, invoice.jobId);
      await tx.documentShareToken.updateMany({
        where: { documentId: payment.receipt.documentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await audit(tx, a, "PaymentRecord", paymentId, "REVERSE", {
      reason,
      invoiceId: id,
    });
    return readInvoice(a, id, tx);
  });
}
export async function voidInvoice(a: Actor, id: string, raw: unknown) {
  office(a);
  const { reason } = z
    .object({ reason: z.string().trim().min(1).max(4000) })
    .strict()
    .parse(raw);
  return transaction(async (tx, files) => {
    const row = await lockInvoice(tx, a, id);
    if (row.voidedAt) throw new HttpError(409, "Invoice is already void.");
    if (row.amountPaidCents)
      throw new HttpError(
        409,
        "Reverse recorded payments before voiding this invoice.",
      );
    await tx.invoice.update({
      where: { id },
      data: { voidedAt: new Date(), voidReason: reason },
    });
    await ledger(tx, files, a, id);
    await tx.documentShareToken.updateMany({
      where: { documentId: row.documentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(tx, a, "Invoice", id, "VOID", { reason });
    return readInvoice(a, id, tx);
  });
}
export async function readReceipt(a: Actor, id: string) {
  const row = await db.receipt.findFirst({
    where: { id, invoice: invoiceScope(a) },
    include: {
      payment: true,
      document: { include: { versions: { orderBy: { version: "desc" } } } },
    },
  });
  if (!row) throw new HttpError(404, "Receipt not found.");
  await readInvoice(a, row.invoiceId);
  return { ...row, status: row.payment.reversedAt ? "VOID" : "RECEIPT" };
}
export async function listReceipts(a: Actor) {
  const invoices = await db.invoice.findMany({
    where: invoiceScope(a),
    select: { id: true },
  });
  const rows = await db.receipt.findMany({
    where: { invoiceId: { in: invoices.map((i) => i.id) } },
    select: { id: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(rows.map((r) => readReceipt(a, r.id)));
}
