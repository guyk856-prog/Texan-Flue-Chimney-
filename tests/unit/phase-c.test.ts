import { it, expect, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { invoiceState, todayDallas, paymentInput } from "@/lib/invoices";
import {
  checklistSchema,
  CHIMNEY_CHECKLIST,
  DRYER_CHECKLIST,
} from "@/lib/checklists";
import { layoutFor } from "@/lib/document-layouts";
import { visitor } from "@/lib/sharing";
it("derives financial statuses, with time-bound overdue calculation", () => {
  const row = {
    voidedAt: null,
    issueDate: new Date("2026-01-01"),
    dueDate: new Date("2026-02-01"),
    totalCents: 442500,
  };
  expect(invoiceState(row, 0, false, "2026-02-01")).toBe("ISSUED");
  expect(invoiceState(row, 0, false, "2026-02-02")).toBe("OVERDUE");
  expect(invoiceState(row, 100000, false, "2026-01-30")).toBe("PARTIALLY_PAID");
  expect(invoiceState(row, 442500, false, "2027-01-01")).toBe("PAID");
  expect(invoiceState({ ...row, voidedAt: new Date() }, 0)).toBe("VOID");
  expect(invoiceState({ ...row, issueDate: null }, 0)).toBe("DRAFT");
  expect(invoiceState(row, 0, true, "2026-01-30")).toBe("SENT");
});
it("uses Dallas calendar days across UTC midnight", () => {
  expect(todayDallas(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10-31");
});
it("rejects fake or fractional payments and caller-supplied ledger fields", () => {
  const p = {
    amountCents: 100000,
    method: "CHECK",
    paidAt: "2026-01-01T12:00:00Z",
    received: true,
  };
  expect(paymentInput.safeParse(p).success).toBe(true);
  for (const v of [
    { ...p, amountCents: 1.5 },
    { ...p, received: false },
    { ...p, method: "CARD" },
    { ...p, amountPaidCents: 100000 },
  ])
    expect(paymentInput.safeParse(v).success).toBe(false);
});
it("seeds separate complete checklists and rejects duplicate keys", () => {
  expect(CHIMNEY_CHECKLIST).toHaveLength(14);
  expect(DRYER_CHECKLIST).toHaveLength(5);
  expect(
    checklistSchema.safeParse([
      { key: "same", title: "One" },
      { key: "same", title: "Two" },
    ]).success,
  ).toBe(false);
});
it("renders inspection findings and photo blocks, not invoice totals", () => {
  for (const t of ["INSPECTION", "DRYER_VENT_REPORT"] as const) {
    const blocks = layoutFor(t).blocks;
    expect(blocks.some((b) => b.type === "inspectionFindings")).toBe(true);
    expect(blocks.some((b) => b.type === "photoGrid")).toBe(true);
    expect(blocks.some((b) => b.type === "totals")).toBe(false);
  }
});
it("does not trust client-supplied proxy IP headers by default", () => {
  const old = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  expect(visitor(new Headers({ "x-forwarded-for": "1.2.3.4" })).ip).toBeNull();
  process.env.TRUST_PROXY = "true";
  expect(visitor(new Headers({ "x-forwarded-for": "1.2.3.4" })).ip).toBe(
    "1.2.3.4",
  );
  expect(visitor(new Headers({ "x-forwarded-for": "spoofed" })).ip).toBeNull();
  if (old === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = old;
});

import { businessDate } from "@/lib/business-date";
it("prints actual receipt instants on the Dallas calendar date", () => {
  expect(businessDate("2026-11-01T01:00:00Z")).toBe("Oct 31, 2026");
});
