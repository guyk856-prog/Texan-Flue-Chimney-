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
    type: z.literal("ESTIMATE"),
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
    .min(1)
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
});
export type EstimateSnapshot = z.infer<typeof snapshotSchema>;
