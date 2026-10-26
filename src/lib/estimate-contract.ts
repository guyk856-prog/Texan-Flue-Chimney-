import { z } from "zod";
import { quantityHundredths } from "./money";
export const TAX_CONFIRMATION =
  "Removing tax or a service fee from this document does not determine what is actually owed. You remain responsible for accurate tax and fee treatment.";
const txt = z.string().max(20000);
const short = z.string().trim().min(1).max(250);
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(100);
export const lineInput = z
  .object({
    serviceId: id.nullable().optional(),
    title: short,
    description: txt.default(""),
    quantity: z.string().refine((v) => {
      try {
        quantityHundredths(v);
        return true;
      } catch {
        return false;
      }
    }, "Use a positive decimal quantity with at most two decimal places."),
    unit: short.default("each"),
    unitPriceCents: z.number().int().min(0).max(2147483647),
    discountCents: z.number().int().min(0).max(2147483647).default(0),
    taxable: z.boolean().default(false),
    note: txt.default(""),
  })
  .strict();
export const preferencesSchema = z
  .object({
    includeTax: z.boolean().default(true),
    includeFee: z.boolean().default(true),
    removalConfirmed: z.boolean().default(false),
  })
  .strict();
export const estimateInput = z
  .object({
    customerId: id,
    propertyId: id,
    jobId: id.nullable().optional(),
    lineItems: z.array(lineInput).min(1).max(100),
    discountCents: z.number().int().min(0).max(2147483647).default(0),
    depositRequestCents: z.number().int().min(0).max(2147483647).default(0),
    terms: txt.default(""),
    exclusions: txt.default(""),
    assumptions: txt.default(""),
    warrantyTerms: txt.default(""),
    customerNote: txt.default(""),
    internalNote: txt.default(""),
    validUntil: z.iso.date().nullable().default(null),
    preferences: preferencesSchema.default({
      includeTax: true,
      includeFee: true,
      removalConfirmed: false,
    }),
  })
  .strict();
export type EstimateInput = z.infer<typeof estimateInput>;
