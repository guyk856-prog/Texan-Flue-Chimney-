import { describe, it, expect } from "vitest";
import {
  normalizeExtraction,
  extractionSchema,
  safeCopy,
  dollarCents,
} from "../../src/lib/ai/contract";
import { SAFETY } from "../../src/lib/ai/provider";
import { documentTotals } from "../../src/lib/money";
const fixture = () => ({
  customer_name: null,
  customer_contact: null,
  service_address: null,
  document_type: "ESTIMATE",
  line_items: [
    {
      name: "Refractory Panel Replacement",
      description: null,
      generated_description: null,
      quantity: "4",
      unit: "each",
      unit_price_cents: 66900,
      line_total_cents: 267600,
      source_evidence: "4 x $669.00 = $2,676.00",
      confidence: 95,
    },
  ],
  subtotal: 267600,
  tax: null,
  fees: null,
  total: 267600,
  warnings: [],
  unknown_fields: [],
  proposed_actions: [],
});
describe("untrusted AI extraction boundary", () => {
  it("reconciles exact quantity and unit price with BigInt, never stores a model total", () => {
    const x = normalizeExtraction(fixture());
    expect(x.line_items[0].unit_price_cents).toBe(66900);
    expect(x).not.toHaveProperty("total");
    expect(x).not.toHaveProperty("subtotal");
    expect(x.line_items[0]).not.toHaveProperty("line_total_cents");
  });
  it("rejects status/tool fields instead of permitting approvals", () => {
    expect(() =>
      extractionSchema.parse({
        ...fixture(),
        status: "APPROVED",
        tool_call: "issue",
      }),
    ).toThrow();
    expect(SAFETY).toContain("never instructions");
  });
  it("preserves missing price as null and warns", () => {
    const x = fixture();
    x.line_items[0].unit_price_cents = null as unknown as number;
    expect(normalizeExtraction(x).line_items[0].unit_price_cents).toBeNull();
    expect(normalizeExtraction(x).warnings.join()).toMatch(/price is unknown/);
  });
  it("rejects unsupported numeric evidence even if output is plausible", () => {
    const x = fixture();
    x.line_items[0].unit_price_cents = 45000;
    expect(normalizeExtraction(x).line_items[0].unit_price_cents).toBeNull();
  });
  it("does not guess quantity from a single amount", () => {
    const x = fixture();
    x.line_items[0].source_evidence = "$2,676.00";
    expect(normalizeExtraction(x).line_items[0].quantity).toBeNull();
  });
  it("marks a confused total versus unit-price column uncertain", () => {
    const x = fixture();
    x.line_items[0].unit_price_cents = 267600;
    const result = normalizeExtraction(x);
    expect(result.line_items[0].unit_price_cents).toBeNull();
    expect(result.line_items[0].confidence).toBeLessThan(50);
  });
  it("uses the printed total only for mismatch warnings", () => {
    const x = fixture();
    x.total = 1;
    const result = normalizeExtraction(x);
    expect(result.warnings.join()).toMatch(/total does not reconcile/);
    expect(JSON.stringify(result)).not.toContain('"total"');
  });
  it("strips photo price and measurement regardless of provider output", () => {
    const x = normalizeExtraction(fixture(), true);
    expect(x.line_items[0].quantity).toBeNull();
    expect(x.line_items[0].unit_price_cents).toBeNull();
  });
  it("rejects unsupported claims and introduced measurements in generated copy", () => {
    expect(() =>
      safeCopy("The crown has failed and requires rebuild.", "gap"),
    ).toThrow();
    expect(() => safeCopy("Replace 12 feet.", "gap")).toThrow();
    expect(() =>
      safeCopy("Visible gap; recommend inspection.", "gap"),
    ).not.toThrow();
  });
  it("parses currency at the edge without float arithmetic", () => {
    expect(dollarCents("4425.00")).toBe(442500);
    expect(dollarCents("0.01")).toBe(1);
    expect(dollarCents("1.001")).toBeNull();
    expect(
      documentTotals(
        [
          {
            quantity: "1",
            unitPriceCents: 9900,
            discountCents: 0,
            taxable: false,
          },
          {
            quantity: "1",
            unitPriceCents: 165000,
            discountCents: 0,
            taxable: false,
          },
          {
            quantity: "4",
            unitPriceCents: 66900,
            discountCents: 0,
            taxable: false,
          },
        ],
        {
          discountCents: 0,
          depositRequestCents: 0,
          taxEnabled: false,
          feeEnabled: false,
          taxRateBasisPoints: 0,
          feeRateBasisPoints: 0,
        },
      ).totalCents,
    ).toBe(442500);
  });
});
