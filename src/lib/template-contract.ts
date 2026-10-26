import { z } from "zod";
export const DISCLAIMERS = {
  estimate:
    "This is a proposal, not an invoice. No work is scheduled or authorized until you approve it. Prices are valid until the date shown.",
  invoice:
    "Payment is recorded manually by our office. This document is not a payment page and does not process cards.",
  inspection:
    "This report records what was visible and accessible on the date of inspection. Areas listed as Not Inspected were not examined. It is not a code-compliance certification.",
  receipt: "Receipt for a payment recorded by our office on the date shown.",
  "work authorization":
    "Authorizes the scope described above. Additional work requires a separate change order.",
} as const;
const copy = z.string().max(4000);
const block = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("header"),
    options: z.object({ showTagline: z.boolean().default(true) }).strict(),
  }),
  z.object({
    type: z.literal("docTitle"),
    options: z.object({ label: copy }).strict(),
  }),
  z.object({
    type: z.literal("partyBlock"),
    options: z
      .object({
        columns: z
          .array(z.enum(["customer", "property"]))
          .min(1)
          .max(2),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("lineItemTable"),
    options: z
      .object({
        columns: z
          .array(z.enum(["service", "detail", "qty", "unitPrice", "total"]))
          .min(1)
          .max(5),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("totals"),
    options: z.object({ showDeposit: z.boolean().default(true) }).strict(),
  }),
  z.object({
    type: z.literal("richText"),
    options: z
      .object({
        field: z.enum([
          "terms",
          "exclusions",
          "assumptions",
          "warrantyTerms",
          "customerNote",
        ]),
        heading: copy,
        copy: copy.optional(),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("photoGrid"),
    options: z
      .object({
        source: z.literal("findings"),
        perRow: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("signatureBlock"),
    options: z.object({ mode: z.enum(["customer", "technician"]) }).strict(),
  }),
  z.object({
    type: z.literal("footer"),
    options: z
      .object({
        disclaimer: z.enum([
          "estimate",
          "invoice",
          "inspection",
          "receipt",
          "work authorization",
        ]),
        copy: copy.max(240).optional(),
      })
      .strict(),
  }),
]);
export type Block = z.infer<typeof block>;
export type Layout = { blocks: Block[] };
const allowed = new Set([
  "header",
  "docTitle",
  "partyBlock",
  "lineItemTable",
  "totals",
  "richText",
  "photoGrid",
  "signatureBlock",
  "footer",
]);
export function parseLayout(raw: unknown): Layout {
  const envelope = z
    .object({ blocks: z.array(z.unknown()).max(30) })
    .strict()
    .parse(raw);
  return {
    blocks: envelope.blocks
      .filter(
        (v): v is object =>
          typeof v === "object" &&
          v !== null &&
          allowed.has(String((v as { type?: unknown }).type)),
      )
      .map((v) => block.parse(v)),
  };
}
export function validateEstimateLayout(raw: unknown): Layout {
  const layout = parseLayout(raw);
  for (const required of [
    "header",
    "docTitle",
    "partyBlock",
    "lineItemTable",
    "totals",
    "footer",
  ]) {
    if (layout.blocks.filter((b) => b.type === required).length !== 1)
      throw new Error(`Template requires exactly one ${required} block.`);
  }
  const table = layout.blocks.find((b) => b.type === "lineItemTable")!;
  if (
    table.type === "lineItemTable" &&
    ["service", "detail", "qty", "unitPrice", "total"].some(
      (c) => !table.options.columns.includes(c as "service"),
    )
  )
    throw new Error("Estimate tables must retain all five columns.");
  const footer = layout.blocks.find((b) => b.type === "footer")!;
  if (footer.type === "footer" && footer.options.disclaimer !== "estimate")
    throw new Error("Estimate disclaimer is required.");
  return layout;
}
export const DEFAULT_ESTIMATE_LAYOUT: Layout = {
  blocks: [
    { type: "header", options: { showTagline: true } },
    { type: "docTitle", options: { label: "CUSTOMER ESTIMATE" } },
    { type: "partyBlock", options: { columns: ["customer", "property"] } },
    {
      type: "lineItemTable",
      options: { columns: ["service", "detail", "qty", "unitPrice", "total"] },
    },
    { type: "totals", options: { showDeposit: true } },
    { type: "richText", options: { field: "terms", heading: "Terms" } },
    {
      type: "richText",
      options: { field: "exclusions", heading: "Exclusions" },
    },
    {
      type: "richText",
      options: { field: "assumptions", heading: "Assumptions" },
    },
    {
      type: "richText",
      options: { field: "warrantyTerms", heading: "Warranty terms" },
    },
    {
      type: "richText",
      options: { field: "customerNote", heading: "Customer note" },
    },
    { type: "signatureBlock", options: { mode: "customer" } },
    { type: "footer", options: { disclaimer: "estimate" } },
  ],
};
