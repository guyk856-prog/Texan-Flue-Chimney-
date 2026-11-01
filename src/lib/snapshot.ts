import { z } from "zod";
import { parseLayout } from "./template-contract";
import { preferencesSchema } from "./estimate-contract";
const cents = z.number().int().min(0).max(2147483647);
const txt = z.string();
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  templateVersionId: txt,
  template: z.unknown().transform(parseLayout),
  document: z.object({
    id: txt,
    number: txt,
    type: z.enum([
      "ESTIMATE",
      "INVOICE",
      "RECEIPT",
      "INSPECTION",
      "DRYER_VENT_REPORT",
      "APPROVAL_CERTIFICATE",
    ]),
    version: z.number().int().positive(),
    status: txt,
    issuedAt: txt.nullable(),
    validUntil: txt.nullable(),
    revisionOf: txt.nullable(),
  }),
  organization: z.object({
    name: txt,
    brandName: txt,
    phone: txt,
    email: txt,
    website: txt,
    addrLine1: txt,
    addrLine2: txt.nullable(),
    city: txt,
    state: txt,
    postal: txt,
  }),
  customer: z.object({
    id: txt,
    name: txt,
    companyName: txt.nullable(),
    phone: txt.nullable(),
    email: txt.nullable(),
    billLine1: txt.nullable(),
    billLine2: txt.nullable(),
    billCity: txt.nullable(),
    billState: txt.nullable(),
    billPostal: txt.nullable(),
  }),
  property: z.object({
    id: txt,
    label: txt.nullable(),
    line1: txt,
    line2: txt.nullable(),
    city: txt,
    state: txt,
    postal: txt,
  }),
  lines: z
    .array(
      z.object({
        serviceId: txt.nullable(),
        title: txt,
        description: txt,
        quantity: txt,
        unit: txt,
        unitPriceCents: cents,
        discountCents: cents,
        taxable: z.boolean(),
        lineTotalCents: cents,
        note: txt,
        companyDefinedTerm: z.boolean(),
        scopeSteps: z.array(txt),
      }),
    )
    .min(0)
    .max(100),
  totals: z.object({
    subtotalCents: cents,
    discountCents: cents,
    taxCents: cents,
    feeCents: cents,
    totalCents: cents,
    depositRequestCents: cents,
  }),
  tax: z.object({
    enabled: z.boolean(),
    label: txt,
    rateBasisPoints: z.number().int(),
  }),
  fee: z.object({
    enabled: z.boolean(),
    label: txt,
    rateBasisPoints: z.number().int(),
  }),
  preferences: preferencesSchema,
  terms: txt,
  exclusions: txt,
  assumptions: txt,
  warrantyTerms: txt,
  customerNote: txt,
  disclaimer: txt,
  footerCopy: txt,
  limitations: txt.default(""),
  summary: txt.default(""),
  recommendations: txt.default(""),
  paymentInstructions: txt.default(""),
  inspection: z
    .object({
      kind: z.enum(["CHIMNEY", "DRYER_VENT"]),
      performedAt: txt,
      weather: txt,
      technicianName: txt,
      techSignedAt: txt.nullable(),
      sections: z
        .array(
          z.object({
            title: txt,
            findings: z.array(
              z.object({
                id: txt,
                title: txt,
                status: z.enum(["PASS", "FAIL", "NA", "NOT_INSPECTED"]),
                severity: txt.nullable(),
                observation: txt,
                recommendation: txt,
                photos: z
                  .array(
                    z.object({
                      data: z
                        .string()
                        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
                      caption: txt,
                      phase: txt.nullable(),
                      pairKey: txt.nullable(),
                    }),
                  )
                  .max(30),
              }),
            ),
          }),
        )
        .max(50),
    })
    .optional(),
  financial: z
    .object({
      amountPaidCents: cents,
      balanceCents: cents,
      issueDate: txt.nullable(),
      dueDate: txt.nullable(),
      status: txt,
    })
    .optional(),
  receipt: z
    .object({
      paymentId: txt,
      invoiceNumber: txt,
      amountCents: cents,
      method: txt,
      paidAt: txt,
      reference: txt,
      note: txt,
      balanceAfterCents: cents,
      voidReason: txt.nullable(),
    })
    .optional(),
  signature: z
    .object({
      name: txt,
      email: txt,
      phone: txt,
      typedName: txt,
      signedAt: txt,
      consentText: txt,
      consentVersion: txt,
      reviewedContentHash: txt,
      action: txt,
    })
    .optional(),
  certificate: z
    .object({
      sourceNumber: txt,
      sourceDocumentId: txt,
      sourceVersion: z.number().int(),
      signedContentHash: txt,
    })
    .optional(),
});
export type EstimateSnapshot = z.infer<typeof snapshotSchema>;
