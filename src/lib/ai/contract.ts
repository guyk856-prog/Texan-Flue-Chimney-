import { z } from "zod";
import { lineTotal, quantityHundredths, documentTotals } from "../money";
const text = z.string().max(12000),
  amount = z.number().int().min(0).max(2147483647).nullable();
export const extractedLine = z
  .object({
    name: text.nullable(),
    description: text.nullable(),
    generated_description: text.nullable(),
    quantity: z
      .string()
      .refine((v) => {
        try {
          quantityHundredths(v);
          return true;
        } catch {
          return false;
        }
      })
      .nullable(),
    unit: text.nullable(),
    unit_price_cents: amount,
    line_total_cents: amount,
    source_evidence: text,
    confidence: z.number().int().min(0).max(100),
  })
  .strict();
export const extractionSchema = z
  .object({
    customer_name: text.nullable(),
    customer_contact: text.nullable(),
    service_address: text.nullable(),
    document_type: z.enum(["ESTIMATE", "INVOICE", "PHOTO", "UNKNOWN"]),
    line_items: z.array(extractedLine).max(40),
    subtotal: amount,
    tax: amount,
    fees: amount,
    total: amount,
    warnings: z.array(text).max(100),
    unknown_fields: z.array(text).max(100),
    proposed_actions: z.array(z.enum(["REMOVE_TAX", "REMOVE_FEE"])).max(2),
  })
  .strict();
export type Extracted = z.infer<typeof extractionSchema>;
export type Reviewed = Omit<Extracted, "total" | "subtotal" | "line_items"> & {
  line_items: Omit<Extracted["line_items"][number], "line_total_cents">[];
};
export const WRITING_ACTIONS = [
  "Write with AI",
  "Improve",
  "Explain to Customer",
  "Translate Hebrew to English",
  "Shorter",
  "More Detailed",
  "Generate Scope",
  "Suggested Exclusions",
] as const;
export const writingInput = z
  .object({
    action: z.enum(WRITING_ACTIONS),
    text: z.string().max(10000),
    notes: z.string().max(10000),
    serviceId: z.string().max(100).nullable(),
    resource: z
      .object({
        kind: z.enum(["estimate", "inspection", "job"]),
        id: z.string().max(100),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const writingOutput = z
  .object({
    text: z.string().min(1).max(10000),
    warnings: z.array(text).max(30),
  })
  .strict();
// Display strings cross into integer cents without binary decimal arithmetic.
export function dollarCents(v: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(v)) return null;
  const [w, f = ""] = v.split(".");
  const n = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  return n <= 2147483647n ? Number(n) : null;
}
export function safeCopy(value: string, context: string) {
  const vocabulary = [
    [108, 105, 99, 101, 110, 115, 101, 100],
    [99, 101, 114, 116, 105, 102, 105, 101, 100],
    [67, 83, 73, 65],
    [99, 111, 100, 101, 32, 99, 111, 109, 112, 108, 105, 97, 110, 116],
    [98, 111, 110, 100, 101, 100],
    [103, 117, 97, 114, 97, 110, 116, 101, 101, 100],
  ].map((points) => String.fromCodePoint(...points).replace(" ", "[- ]"));
  if (
    new RegExp("\\b(?:" + vocabulary.join("|") + ")\\b", "i").test(value) ||
    /\b(?:NFPA\s*(?:211)?\s*level|requires?\s+(?:a\s+)?rebuild|has failed)\b/i.test(
      value,
    )
  )
    throw new Error(
      "Generated copy contains an unsupported claim. Rewrite manually or retry.",
    );
  if (/[\u0590-\u05ff]/.test(value))
    throw new Error(
      "Customer copy must be English. Retry or translate manually.",
    );
  const sourceNumbers = new Set(context.match(/\d+(?:\.\d+)?/g) ?? []);
  for (const n of value.match(/\d+(?:\.\d+)?/g) ?? [])
    if (!sourceNumbers.has(n))
      throw new Error(
        "Generated copy introduced an unstated number. Review manually.",
      );
  return value;
}
export function normalizeExtraction(raw: unknown, photo = false): Reviewed {
  const x = extractionSchema.parse(raw);
  const warnings = [...x.warnings],
    unknown = new Set(x.unknown_fields);
  const lines = x.line_items.map((l, i) => {
    let quantity = l.quantity,
      price = l.unit_price_cents,
      confidence = l.confidence;
    const evidenceNumbers = (
      l.source_evidence.match(/\d[\d,]*(?:\.\d{1,2})?/g) ?? []
    ).map((n) => n.replaceAll(",", ""));
    if (
      price !== null &&
      !evidenceNumbers.some((n) => dollarCents(n) === price)
    ) {
      price = null;
      warnings.push(
        `Line ${i + 1}: price is not supported by source evidence.`,
      );
    }
    if (
      quantity !== null &&
      !evidenceNumbers.some((n) => {
        try {
          return quantityHundredths(n) === quantityHundredths(quantity!);
        } catch {
          return false;
        }
      })
    ) {
      quantity = null;
      warnings.push(`Line ${i + 1}: quantity is not explicitly shown.`);
    }
    if (photo) {
      for (const copy of [l.name, l.description, l.generated_description])
        if (copy) safeCopy(copy, "");
      price = null;
      quantity = null;
      warnings.push(
        `Line ${i + 1}: photo observations are not a diagnosis, measurement or price.`,
      );
    }
    if (
      quantity !== null &&
      price !== null &&
      l.line_total_cents !== null &&
      lineTotal({
        quantity,
        unitPriceCents: price,
        discountCents: 0,
        taxable: false,
      }) !== l.line_total_cents
    ) {
      price = null;
      confidence = Math.min(confidence, 40);
      warnings.push(
        `Line ${i + 1}: quantity × unit price disagrees with the printed line amount. Price requires review.`,
      );
    }
    if (quantity === null) {
      unknown.add(`line_items.${i}.quantity`);
      warnings.push(`Line ${i + 1}: quantity is unknown.`);
    }
    if (price === null) {
      unknown.add(`line_items.${i}.unit_price_cents`);
      warnings.push(`Line ${i + 1}: price is unknown; enter it explicitly.`);
    }
    const context = l.source_evidence;
    const generated = l.generated_description
      ? safeCopy(l.generated_description, context)
      : null;
    return {
      name: l.name,
      description: l.description,
      generated_description: generated,
      quantity,
      unit: l.unit,
      unit_price_cents: price,
      source_evidence: l.source_evidence,
      confidence,
    };
  });
  if (
    lines.length &&
    lines.every((l) => l.quantity !== null && l.unit_price_cents !== null)
  ) {
    const server = documentTotals(
      lines.map((l) => ({
        quantity: l.quantity!,
        unitPriceCents: l.unit_price_cents!,
        discountCents: 0,
        taxable: false,
      })),
      {
        discountCents: 0,
        depositRequestCents: 0,
        taxEnabled: false,
        feeEnabled: false,
        taxRateBasisPoints: 0,
        feeRateBasisPoints: 0,
      },
    );
    if (x.subtotal !== null && x.subtotal !== server.subtotalCents)
      warnings.push(
        "Printed subtotal does not reconcile with server-calculated lines.",
      );
    if (
      x.total !== null &&
      BigInt(x.total) !==
        BigInt(server.totalCents) + BigInt(x.tax ?? 0) + BigInt(x.fees ?? 0)
    )
      warnings.push(
        "Printed total does not reconcile; review columns, quantities and unit prices.",
      );
  }
  for (const k of [
    "customer_name",
    "customer_contact",
    "service_address",
  ] as const)
    if (x[k] === null) unknown.add(k);
  return {
    customer_name: x.customer_name,
    customer_contact: x.customer_contact,
    service_address: x.service_address,
    document_type: x.document_type,
    line_items: lines,
    tax: x.tax,
    fees: x.fees,
    warnings: [...new Set(warnings)],
    unknown_fields: [...unknown],
    proposed_actions: x.proposed_actions,
  };
}
