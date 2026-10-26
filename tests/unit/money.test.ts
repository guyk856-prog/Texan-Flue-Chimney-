import { describe, it, expect } from "vitest";
import { lineTotal, documentTotals, quantityHundredths } from "@/lib/money";
import { estimateInput } from "@/lib/estimate-contract";
import {
  DEFAULT_ESTIMATE_LAYOUT,
  parseLayout,
  validateEstimateLayout,
} from "@/lib/template-contract";
import ts from "typescript";
import path from "node:path";
const line = (
  quantity: string,
  unitPriceCents: number,
  discountCents = 0,
  taxable = false,
) => ({ quantity, unitPriceCents, discountCents, taxable });
const off = {
  discountCents: 0,
  depositRequestCents: 0,
  taxEnabled: false,
  feeEnabled: false,
  taxRateBasisPoints: 825,
  feeRateBasisPoints: 300,
};
describe("exact monetary arithmetic", () => {
  it("computes scenario A exactly", () => {
    expect(
      documentTotals(
        [line("1", 9900), line("1", 165000), line("4", 66900)],
        off,
      ),
    ).toEqual({
      subtotalCents: 442500,
      discountCents: 0,
      taxCents: 0,
      feeCents: 0,
      totalCents: 442500,
      depositRequestCents: 0,
    });
  });
  it("rounds half-up once then subtracts discount", () => {
    expect(lineTotal(line("0.50", 1))).toBe(1);
    expect(lineTotal(line("0.49", 1))).toBe(0);
    expect(lineTotal(line("1.50", 1, 1))).toBe(1);
    expect(lineTotal(line("0.50", 1, 1))).toBe(0);
    expect(quantityHundredths("1.25")).toBe(125n);
  });
  it("rejects floating quantity inputs, negative totals and Int overflow", () => {
    expect(() => quantityHundredths("1.005")).toThrow();
    expect(() => quantityHundredths("1e2")).toThrow();
    expect(() => lineTotal(line("1", 1, 2))).toThrow();
    expect(() => lineTotal(line("2", 2147483647))).toThrow();
    expect(() => lineTotal(line("1", 1.5))).toThrow();
  });
  it("applies enabled rates after discounts using integer rationals", () => {
    expect(
      documentTotals([line("1", 10000, 0, true)], {
        ...off,
        discountCents: 1000,
        taxEnabled: true,
        feeEnabled: true,
      }).totalCents,
    ).toBe(10013);
    expect(documentTotals([line("1", 10000, 0, true)], off).totalCents).toBe(
      10000,
    );
  });
  it("rejects excessive document discounts and deposits", () => {
    expect(() =>
      documentTotals([line("1", 100)], { ...off, discountCents: 101 }),
    ).toThrow();
    expect(() =>
      documentTotals([line("1", 100)], { ...off, depositRequestCents: 101 }),
    ).toThrow();
  });
  it("does not accept client-supplied total fields", () => {
    expect(
      estimateInput.safeParse({
        customerId: "demo",
        propertyId: "demo",
        lineItems: [
          {
            title: "DEMO",
            quantity: "1",
            unitPriceCents: 99,
            lineTotalCents: 1,
          },
        ],
        totalCents: 1,
      }).success,
    ).toBe(false);
  });
  it("statically verifies every arithmetic expression in the calculation path has BigInt type", () => {
    const file = path.resolve("src/lib/money.ts");
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
      skipLibCheck: true,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file)!;
    const types: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "formatCents")
        return;
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.MinusToken,
          ts.SyntaxKind.AsteriskToken,
          ts.SyntaxKind.SlashToken,
        ].includes(node.operatorToken.kind)
      ) {
        types.push(checker.typeToString(checker.getTypeAtLocation(node)));
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(types.length).toBeGreaterThan(10);
    expect(types.every((t) => t === "bigint")).toBe(true);
  });
});
describe("template allow-list", () => {
  it("drops unknown blocks instead of rendering markup", () => {
    const layout = parseLayout({
      blocks: [
        { type: "script", options: { html: "<script>alert(1)</script>" } },
        ...DEFAULT_ESTIMATE_LAYOUT.blocks,
      ],
    });
    expect(layout).toEqual(DEFAULT_ESTIMATE_LAYOUT);
  });
  it("requires totals, columns and the exact estimate disclaimer type", () => {
    expect(() =>
      validateEstimateLayout({
        blocks: DEFAULT_ESTIMATE_LAYOUT.blocks.filter(
          (b) => b.type !== "totals",
        ),
      }),
    ).toThrow();
    expect(() =>
      validateEstimateLayout({
        blocks: DEFAULT_ESTIMATE_LAYOUT.blocks.map((b) =>
          b.type === "footer"
            ? { type: "footer", options: { disclaimer: "invoice" } }
            : b,
        ),
      }),
    ).toThrow();
  });
});
