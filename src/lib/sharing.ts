import { openStored } from "./storage";
import { z } from "zod";
import { isIP } from "node:net";
import { db } from "./db";
import { type Actor, office } from "./access";
import { HttpError } from "./errors";
import { newToken, hashToken, limit } from "./security";
import { snapshotSchema } from "./snapshot";
import {
  docAccess,
  transaction,
  freeze,
  audit,
  ensureTemplate,
  createNumberedDocument,
  type Tx,
} from "./c-documents";
import { CONSENT_TEXT, CONSENT_VERSION } from "./checklists";
import { parseLayout, DISCLAIMERS } from "./template-contract";
import { todayDallas } from "./invoices";
export const LINK_UNAVAILABLE = "This link is unavailable.";
export type Visitor = { ip: string | null; userAgent: string };
export function visitor(headers: Headers): Visitor {
  const candidate =
    process.env.VERCEL || process.env.TRUST_PROXY === "true"
      ? (
          headers.get("x-vercel-forwarded-for") ??
          headers.get("x-forwarded-for")
        )
          ?.split(",")[0]
          ?.trim()
      : null;
  return {
    ip: candidate && isIP(candidate) ? candidate : null,
    userAgent: (headers.get("user-agent") ?? "").slice(0, 500),
  };
}
async function rate(token: string, v: Visitor) {
  await limit(`share-ip:${v.ip ?? "direct"}`, 240, 60000);
  await limit(`share-token:${hashToken(token)}`, 60, 60000);
}
async function tokenRow(tx: Tx, token: string) {
  const row = await tx.documentShareToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      document: {
        include: {
          estimate: true,
          invoice: true,
          inspection: true,
          receipt: { include: { invoice: true } },
        },
      },
    },
  });
  if (!row || row.revokedAt || row.expiresAt <= new Date())
    throw new HttpError(404, LINK_UNAVAILABLE);
  const e = row.document.estimate,
    i = row.document.invoice,
    n = row.document.inspection;
  if (e?.deletedAt || i?.deletedAt || i?.voidedAt || n?.deletedAt)
    throw new HttpError(404, LINK_UNAVAILABLE);
  const resource = e ?? i ?? n ?? row.document.receipt?.invoice;
  if (
    resource &&
    (!(await tx.customer.findFirst({
      where: { id: resource.customerId, deletedAt: null },
    })) ||
      !(await tx.property.findFirst({
        where: { id: resource.propertyId, deletedAt: null },
      })))
  )
    throw new HttpError(404, LINK_UNAVAILABLE);
  const version = await tx.documentVersion.findUnique({
    where: {
      documentId_version: { documentId: row.documentId, version: row.version },
    },
    include: { pdfFile: true },
  });
  if (!version?.issuedAt || !version.pdfFile || version.pdfFile.deletedAt)
    throw new HttpError(404, LINK_UNAVAILABLE);
  const snapshot = snapshotSchema.parse(version.snapshot);
  if (
    !resource &&
    (!(await tx.customer.findFirst({
      where: {
        id: snapshot.customer.id,
        organizationId: row.document.organizationId,
        deletedAt: null,
      },
    })) ||
      !(await tx.property.findFirst({
        where: {
          id: snapshot.property.id,
          customerId: snapshot.customer.id,
          deletedAt: null,
        },
      })))
  )
    throw new HttpError(404, LINK_UNAVAILABLE);
  return { row, version, snapshot };
}
function signable(record: Awaited<ReturnType<typeof tokenRow>>) {
  const { row, snapshot } = record;
  if (snapshot.signature) return false;
  if (row.document.type === "ESTIMATE") {
    const e = row.document.estimate;
    if (
      !e ||
      ["APPROVED", "DECLINED", "EXPIRED", "SUPERSEDED"].includes(e.status)
    )
      return false;
    if (
      snapshot.document.validUntil &&
      snapshot.document.validUntil.slice(0, 10) < todayDallas()
    )
      return false;
    return row.document.currentVersion === row.version;
  }
  if (["INSPECTION", "DRYER_VENT_REPORT"].includes(row.document.type))
    return row.document.currentVersion === row.version;
  return false;
}
export async function createShare(a: Actor, documentId: string) {
  const doc = await docAccess(a, documentId);
  if (
    a.role === "TECHNICIAN" &&
    (!doc.inspection || doc.inspection.technicianId !== a.id)
  )
    office(a);
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id=${documentId} FOR UPDATE`;
    const current = await tx.document.findUniqueOrThrow({
      where: { id: documentId },
    });
    const version = await tx.documentVersion.findUnique({
      where: {
        documentId_version: { documentId, version: current.currentVersion },
      },
    });
    if (!version?.issuedAt)
      throw new HttpError(
        409,
        "Issue or finalize the document before sharing.",
      );
    if (
      (doc.estimate &&
        ["SUPERSEDED", "DECLINED", "EXPIRED"].includes(doc.estimate.status)) ||
      doc.invoice?.voidedAt
    )
      throw new HttpError(409, "This document cannot be shared.");
    const token = newToken();
    const settings = await tx.organizationSettings.findUniqueOrThrow({
      where: { organizationId: a.organizationId },
    });
    const row = await tx.documentShareToken.create({
      data: {
        documentId,
        version: version.version,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + settings.shareTokenTtlHours * 3600000),
      },
    });
    if (doc.estimate?.status === "READY")
      await tx.estimate.update({
        where: { id: doc.estimate.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    if (doc.inspection?.status === "FINALIZED")
      await tx.inspection.update({
        where: { id: doc.inspection.id },
        data: { status: "SHARED" },
      });
    await audit(tx, a, "Document", documentId, "SHARE_LINK_CREATE", {
      tokenId: row.id,
      version: version.version,
    });
    return {
      id: row.id,
      url: `${process.env.AUTH_URL}/share/${token}`,
      expiresAt: row.expiresAt,
    };
  });
}
export async function revokeShare(a: Actor, documentId: string, id: string) {
  await docAccess(a, documentId);
  office(a);
  const changed = await db.documentShareToken.updateMany({
    where: { id, documentId },
    data: { revokedAt: new Date() },
  });
  if (!changed.count) throw new HttpError(404, "Link not found.");
  await transaction((tx) =>
    audit(tx, a, "Document", documentId, "SHARE_LINK_REVOKE", { tokenId: id }),
  );
  return { revoked: true };
}
export async function loadShare(token: string, v: Visitor, track = true) {
  await rate(token, v);
  return transaction(async (tx) => {
    const record = await tokenRow(tx, token);
    if (track) {
      const viewedAt = new Date();
      const updated =
        await tx.$executeRaw`UPDATE "DocumentShareToken" SET "firstViewedAt"=COALESCE("firstViewedAt",${viewedAt}),"lastViewedAt"=${viewedAt},"viewCount"="viewCount"+1 WHERE id=${record.row.id} AND "revokedAt" IS NULL AND "expiresAt">${viewedAt}`;
      if (!updated) throw new HttpError(404, LINK_UNAVAILABLE);
      if (record.row.document.estimate?.status === "SENT")
        await tx.estimate.updateMany({
          where: { id: record.row.document.estimate.id, status: "SENT" },
          data: { status: "VIEWED" },
        });
    }
    return {
      snapshot: record.snapshot,
      canSign: signable(record),
      consentText: CONSENT_TEXT,
      consentVersion: CONSENT_VERSION,
    };
  });
}
export async function sharePdf(token: string, v: Visitor) {
  await rate(token, v);
  const { version, snapshot } = await tokenRow(db, token);
  return {
    stream: () => openStored(version.pdfFile!.storageKey),
    storageKey: version.pdfFile!.storageKey,
    filename: `${snapshot.document.number}-v${snapshot.document.version}.pdf`,
  };
}
const signing = z
  .object({
    action: z.enum(["APPROVE", "DECLINE"]),
    name: z.string().trim().min(1).max(200),
    email: z.union([z.email().max(254), z.literal("")]).default(""),
    phone: z.string().max(60).default(""),
    typedName: z.string().trim().max(200).default(""),
    consent: z.boolean().default(false),
    consentVersion: z.literal(CONSENT_VERSION),
    reason: z.string().trim().max(4000).default(""),
  })
  .strict();
export async function signShare(token: string, v: Visitor, raw: unknown) {
  await rate(token, v);
  const input = signing.parse(raw);
  return transaction(async (tx, files) => {
    let record = await tokenRow(tx, token);
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id=${record.row.documentId} FOR UPDATE`;
    record = await tokenRow(tx, token);
    if (!signable(record))
      throw new HttpError(409, "This version cannot be signed.");
    const { row, version } = record;
    const resource = row.document.estimate ?? row.document.inspection!;
    const a: Actor = {
      id: "",
      role: "OFFICE",
      organizationId: row.document.organizationId,
      name: input.name,
    };
    // Use a real organization user as the storage custodian; the signer is recorded separately.
    const custodian = version.pdfFile?.uploadedById
      ? await tx.user.findFirst({
          where: {
            id: version.pdfFile.uploadedById,
            organizationId: a.organizationId,
          },
        })
      : null;
    if (!custodian) throw new HttpError(409, "Document custodian unavailable.");
    a.id = custodian.id;
    if (input.action === "DECLINE") {
      if (!input.reason)
        throw new HttpError(400, "Enter a reason or request for changes.");
      await tx.signature.create({
        data: {
          documentVersionId: version.id,
          shareTokenId: row.id,
          signerName: input.name,
          signerEmail: input.email,
          signerPhone: input.phone,
          action: "DECLINE",
          userAgent: v.userAgent,
          ip: v.ip,
        },
      });
      if (row.document.estimate)
        await tx.estimate.update({
          where: { id: row.document.estimate.id },
          data: {
            status: "DECLINED",
            declinedAt: new Date(),
            declineReason: input.reason,
          },
        });
      await tx.documentShareToken.updateMany({
        where: { documentId: row.documentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: a.organizationId,
          entity: "Document",
          entityId: row.documentId,
          action: "CUSTOMER_DECLINE",
          after: { tokenId: row.id, reason: input.reason },
          ip: v.ip,
        },
      });
      return { declined: true };
    }
    if (!input.consent || input.typedName !== input.name)
      throw new HttpError(
        400,
        "Enter your name as your signature and affirm electronic-signature consent.",
      );
    const certificateDoc = await createNumberedDocument(
      tx,
      a.organizationId,
      "APPROVAL_CERTIFICATE",
    );
    const action = row.document.estimate ? "APPROVE" : "ACKNOWLEDGE";
    const signedAt = new Date();
    const signed = {
      ...record.snapshot,
      document: {
        ...record.snapshot.document,
        status: action === "APPROVE" ? "APPROVED" : "ACKNOWLEDGED",
      },
      signature: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        typedName: input.typedName,
        signedAt: signedAt.toISOString(),
        consentText: CONSENT_TEXT,
        consentVersion: CONSENT_VERSION,
        reviewedContentHash: version.contentHash!,
        action,
      },
    };
    if (!signed.template.blocks.some((b) => b.type === "signatureBlock"))
      signed.template = {
        blocks: [
          ...signed.template.blocks,
          { type: "signatureBlock", options: { mode: "customer" } },
        ],
      };
    const signedVersion = await freeze(tx, files, a, signed, resource.jobId);
    await tx.signature.create({
      data: {
        documentVersionId: signedVersion.id,
        shareTokenId: row.id,
        signerName: input.name,
        signerEmail: input.email,
        signerPhone: input.phone,
        typedName: input.typedName,
        signedAt,
        action,
        userAgent: v.userAgent,
        ip: v.ip,
      },
    });
    await tx.consentRecord.create({
      data: {
        documentVersionId: signedVersion.id,
        consentTextVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        signerName: input.name,
        agreedAt: signedAt,
        userAgent: v.userAgent,
        ip: v.ip,
      },
    });
    if (row.document.estimate)
      await tx.estimate.update({
        where: { id: row.document.estimate.id },
        data: { status: "APPROVED", approvedAt: signedAt },
      });
    const template = await ensureTemplate(
      tx,
      a.organizationId,
      "APPROVAL_CERTIFICATE",
    );
    const certificate = {
      ...signed,
      document: {
        ...signed.document,
        id: certificateDoc.id,
        number: certificateDoc.number,
        type: "APPROVAL_CERTIFICATE" as const,
        status: "APPROVAL RECORDED",
        version: 1,
        issuedAt: null,
      },
      templateVersionId: template.id,
      template: parseLayout(JSON.parse(template.source)),
      disclaimer:
        record.snapshot.document.type === "ESTIMATE"
          ? DISCLAIMERS.estimate
          : DISCLAIMERS.inspection,
      certificate: {
        sourceNumber: record.snapshot.document.number,
        sourceDocumentId: record.snapshot.document.id,
        sourceVersion: signedVersion.version,
        signedContentHash: signedVersion.contentHash!,
      },
    };
    const certVersion = await freeze(tx, files, a, certificate, resource.jobId);
    await tx.documentShareToken.updateMany({
      where: { documentId: row.documentId, revokedAt: null },
      data: { revokedAt: signedAt },
    });
    const signedToken = newToken(),
      certificateToken = newToken();
    const expiresAt = row.expiresAt;
    await tx.documentShareToken.createMany({
      data: [
        {
          documentId: row.documentId,
          version: signedVersion.version,
          tokenHash: hashToken(signedToken),
          expiresAt,
        },
        {
          documentId: certificateDoc.id,
          version: certVersion.version,
          tokenHash: hashToken(certificateToken),
          expiresAt,
        },
      ],
    });
    await tx.auditLog.create({
      data: {
        organizationId: a.organizationId,
        entity: "Document",
        entityId: row.documentId,
        action: "CUSTOMER_SIGN",
        after: {
          sourceVersionId: version.id,
          signedVersionId: signedVersion.id,
          certificateDocumentId: certificateDoc.id,
          tokenId: row.id,
        },
        ip: v.ip,
      },
    });
    return {
      signedUrl: `/share/${signedToken}`,
      certificateUrl: `/share/${certificateToken}`,
      contentHash: signedVersion.contentHash,
    };
  });
}
