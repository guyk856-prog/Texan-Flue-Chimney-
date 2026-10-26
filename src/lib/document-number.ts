import { DocumentType, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
const PREFIX: Record<DocumentType, string> = {
  ESTIMATE: "EST",
  INVOICE: "INV",
  INSPECTION: "INSP",
  DRYER_VENT_REPORT: "DVR",
  RECEIPT: "RCT",
  WORK_ORDER: "WO",
  WORK_AUTHORIZATION: "WA",
  CHANGE_ORDER: "CO",
  COMPLETION_ACK: "ACK",
  STATEMENT: "STM",
  INSURANCE_SCOPE: "INS",
  APPROVAL_CERTIFICATE: "APR",
};
export async function createNumberedDocument(
  tx: Prisma.TransactionClient,
  organizationId: string,
  type: DocumentType,
  date = new Date(),
) {
  const year = Number(
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      timeZone: "America/Chicago",
    }).format(date),
  );
  // INSERT handles the first concurrent request; the subsequent lock serializes increments.
  await tx.$executeRaw`INSERT INTO "SequenceCounter" ("id","organizationId","type","year","value") VALUES (${randomUUID()},${organizationId},${type}::"DocumentType",${year},0) ON CONFLICT ("organizationId","type","year") DO NOTHING`;
  const [counter] = await tx.$queryRaw<
    { id: string; value: number }[]
  >`SELECT "id","value" FROM "SequenceCounter" WHERE "organizationId"=${organizationId} AND "type"=${type}::"DocumentType" AND "year"=${year} FOR UPDATE`;
  const next = await tx.sequenceCounter.update({
    where: { id: counter.id },
    data: { value: { increment: 1 } },
  });
  return tx.document.create({
    data: {
      organizationId,
      type,
      number: `TF-${PREFIX[type]}-${year}-${String(next.value).padStart(4, "0")}`,
    },
  });
}
