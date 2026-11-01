import type { readInspection } from "../../src/lib/inspections";
import type { readInvoice, readReceipt } from "../../src/lib/invoices";
import type { readEstimate } from "../../src/lib/estimates";
import type { createShare, loadShare } from "../../src/lib/sharing";
import { snapshotSchema } from "../../src/lib/snapshot";
type InspectionDTO = Awaited<ReturnType<typeof readInspection>>;
type InvoiceDTO = Awaited<ReturnType<typeof readInvoice>>;
type ReceiptDTO = Awaited<ReturnType<typeof readReceipt>>;
type EstimateDTO = Awaited<ReturnType<typeof readEstimate>>;
type ShareDTO = Awaited<ReturnType<typeof createShare>>;
type PublicDTO = Awaited<ReturnType<typeof loadShare>>;
import "dotenv/config";
import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";
import { CONSENT_VERSION } from "../../src/lib/checklists";
import { DISCLAIMERS } from "../../src/lib/template-contract";
test.use({ timezoneId: "America/Chicago" });
const db = new PrismaClient(),
  origin = process.env.AUTH_URL ?? "http://localhost:3000",
  stamp = Date.now().toString(),
  password = process.env.SEED_DEMO_PASSWORD!;
let office: APIRequestContext,
  tech: APIRequestContext,
  other: APIRequestContext,
  admin: APIRequestContext,
  anon: APIRequestContext,
  orgId: string,
  customerId: string,
  propertyId: string,
  jobId: string,
  techId: string,
  otherTechId: string,
  inspectionId: string,
  estimateId: string,
  invoiceId: string,
  receiptId: string,
  paymentId: string,
  shareToken: string,
  signedToken: string,
  receiptShareToken: string;
const headers = { origin };
const items = [
  { title: "Chimney Sweep", quantity: "1", unitPriceCents: 9900 },
  {
    title: "Glass Fireplace Doors (17x20 in)",
    quantity: "1",
    unitPriceCents: 165000,
  },
  {
    title: "Refractory Panel Replacement",
    quantity: "4",
    unitPriceCents: 66900,
  },
];
async function login(role: string) {
  const c = await request.newContext({ baseURL: origin });
  const csrf = await (await c.get("/api/auth/csrf")).json();
  await c.post("/api/auth/callback/credentials", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: {
      csrfToken: csrf.csrfToken,
      email: `demo.phasec.${role}.${stamp}@example.test`,
      password,
      callbackUrl: `${origin}/dashboard`,
    },
  });
  expect((await c.get("/api/data/dashboard")).status()).toBe(200);
  return c;
}
async function post(c: APIRequestContext, url: string, data: unknown = {}) {
  return c.post(url, { headers, data });
}
async function ok<T = unknown>(
  r: Awaited<ReturnType<APIRequestContext["get"]>>,
  status = 200,
) {
  expect(r.status(), await r.text()).toBe(status);
  return (await r.json()) as T;
}
async function capturePdf(bytes: Buffer, name: string, page = 1) {
  await mkdir("private/phase-c-evidence", { recursive: true });
  await mkdir("docs/screenshots", { recursive: true });
  const file = path.resolve(`private/phase-c-evidence/${name}.pdf`);
  await writeFile(file, bytes);
  execFileSync("pdftoppm", [
    "-f",
    String(page),
    "-singlefile",
    "-png",
    "-r",
    "110",
    file,
    `docs/screenshots/phase-c-${name}`,
  ]);
  return {
    file,
    text: execFileSync("pdftotext", ["-layout", file, "-"], {
      encoding: "utf8",
    }),
  };
}
async function staffPdf(c: APIRequestContext, docId: string) {
  const link = await ok<ShareDTO>(
    await c.get(`/api/workflow/documents/${docId}/pdf`),
  );
  const r = await c.get(link.url);
  expect(r.status()).toBe(200);
  return r.body();
}
async function inspectionDraft(kind = "CHIMNEY") {
  return ok<InspectionDTO>(
    await post(tech, "/api/workflow/inspections", {
      customerId,
      propertyId,
      jobId,
      kind,
      performedAt: new Date().toISOString(),
      weather: "DEMO clear",
    }),
    201,
  );
}
const estimateBody = () => ({
  customerId,
  propertyId,
  jobId,
  lineItems: items,
  validUntil: "2027-12-31",
  terms: "DEMO scheduling by separate agreement.",
  exclusions: "DEMO no additional work included.",
  assumptions: "DEMO accessible wood-burning chimney only.",
});
test.describe
  .serial("Phase C real inspection, customer approval and payment acceptance", () => {
  test.beforeAll(async () => {
    process.env.XDG_CACHE_HOME ??= "/tmp/texan-phase-c-font-cache";
    await mkdir(process.env.XDG_CACHE_HOME, { recursive: true });
    orgId = `demo-phase-c-${stamp}`;
    await db.organization.create({
      data: {
        id: orgId,
        name: "Texan Flue Chimney Service",
        brandName: "Texan Flue Chimney",
        phone: "469-771-7000",
        email: "",
        website: "https://texanflue.com",
        addrLine1: "2781 N Carroll Ave",
        city: "Dallas",
        state: "TX",
        postal: "75204",
        settings: { create: { taxEnabled: false, feeEnabled: false } },
      },
    });
    const passwordHash = await hash(password, 12);
    for (const role of ["office", "tech", "other", "admin"]) {
      const user = await db.user.create({
        data: {
          organizationId: orgId,
          email: `demo.phasec.${role}.${stamp}@example.test`,
          name: `DEMO ${role.toUpperCase()} Inspector`,
          role:
            role === "office"
              ? "OFFICE"
              : role === "admin"
                ? "ADMIN"
                : "TECHNICIAN",
          passwordHash,
        },
      });
      if (role === "tech") techId = user.id;
      if (role === "other") otherTechId = user.id;
    }
    const c = await db.customer.create({
      data: {
        organizationId: orgId,
        name: "DEMO ONLY — Imaginary Roof Household",
        tags: ["DEMO ONLY"],
        billLine1: "DEMO billing address",
      },
    });
    customerId = c.id;
    const p = await db.property.create({
      data: {
        customerId,
        line1: "DEMO ONLY — 10 Imaginary Chimney Lane",
        city: "Dallas",
        state: "TX",
        postal: "75204",
        gateCode: "PRIVATE-DO-NOT-SHARE",
      },
    });
    propertyId = p.id;
    const job = await db.job.create({
      data: {
        organizationId: orgId,
        customerId,
        propertyId,
        number: `DEMO-C-${stamp}`,
        title: "DEMO ONLY — imaginary roof visit",
        assignments: { create: [{ userId: techId }, { userId: otherTechId }] },
      },
    });
    jobId = job.id;
    office = await login("office");
    tech = await login("tech");
    other = await login("other");
    admin = await login("admin");
    anon = await request.newContext({ baseURL: origin });
  });
  test.afterAll(async () => {
    await Promise.all(
      [office, tech, other, admin, anon].map((c) => c?.dispose()),
    );
    await db.$disconnect();
  });
  test("technician drafts findings on a phone with all four statuses and private paired photos", async ({
    page,
  }) => {
    const draft = await inspectionDraft();
    inspectionId = draft.id;
    const findings = draft.sections
      .flatMap((s: { findings: { id: string }[] }) => s.findings)
      .map((f: { id: string }, i: number) => ({
        id: f.id,
        status: ["PASS", "FAIL", "NA", "NOT_INSPECTED"][i % 4],
        severity: i % 4 === 1 ? "REPAIR_RECOMMENDED" : null,
        observation:
          i % 4 === 3
            ? "DEMO ONLY — not reachable; not examined."
            : "DEMO ONLY — human-entered sample observation.",
        recommendation:
          i % 4 === 1
            ? "DEMO ONLY — discuss the observed area before proposing any repair."
            : "DEMO ONLY — no additional recommendation recorded.",
      }));
    expect(findings).toHaveLength(14);
    const data = {
      limitations: "",
      summary: "DEMO ONLY inspection training fixture, not a real diagnosis.",
      recommendations: "DEMO ONLY review findings with office.",
      weather: "DEMO clear",
      findings,
    };
    await ok(
      await tech.patch(`/api/workflow/inspections/${inspectionId}`, {
        headers,
        data,
      }),
    );
    expect(
      (
        await post(tech, `/api/workflow/inspections/${inspectionId}/signoff`, {
          confirmed: true,
        })
      ).status(),
    ).toBe(400);
    data.limitations =
      "DEMO ONLY — upper flue and concealed areas could not be examined.";
    await ok(
      await tech.patch(`/api/workflow/inspections/${inspectionId}`, {
        headers,
        data,
      }),
    );
    for (const [i, phase] of ["BEFORE", "AFTER"].entries()) {
      const image = await sharp({
        create: {
          width: 2400,
          height: 1800,
          channels: 3,
          background: i ? "#d8c6a4" : "#969b9f",
        },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="2400" height="1800"><text x="150" y="900" font-size="160" fill="black">DEMO ONLY ${phase}</text></svg>`,
            ),
          },
        ])
        .png()
        .toBuffer();
      const photo = await ok<{ id: string }>(
        await tech.post(`/api/inspections/${inspectionId}/photos`, {
          headers,
          multipart: {
            findingId: findings[1].id,
            file: {
              name: `demo-${phase}.png`,
              mimeType: "image/png",
              buffer: image,
            },
            caption: `DEMO ONLY ${phase} reference image; not evidence of real conditions.`,
            phase,
            pairKey: "demo-firebox-pair",
          },
        }),
        201,
      );
      const stored = await db.inspectionPhoto.findUniqueOrThrow({
        where: { id: photo.id },
        include: { file: true, originalFile: true },
      });
      expect(stored.originalFileId).toBeTruthy();
      const dir = path.resolve(
        process.env.PRIVATE_STORAGE_DIR ?? "private/uploads",
      );
      expect(
        await readFile(path.join(dir, stored.originalFile!.storageKey)),
      ).toEqual(image);
      const compressed = await readFile(path.join(dir, stored.file.storageKey));
      expect((await sharp(compressed).metadata()).width).toBe(1600);
      expect(compressed.length).toBeLessThan(image.length);
    }
    await page.context().addCookies((await tech.storageState()).cookies);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/inspections/${inspectionId}`);
    await expect(
      page.getByRole("heading", { name: "Chimney inspection", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Firebox status" })
        .getByRole("button", { name: "PASS", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator('input[capture="environment"]').count()).toBe(14);
    expect(
      (await page.locator(".finding-choice").first().boundingBox())!.height,
    ).toBeGreaterThanOrEqual(48);
    await page
      .getByRole("button", { name: "Save inspection", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("saved");
    await page.screenshot({
      path: "docs/screenshots/phase-c-inspection-phone.png",
      fullPage: true,
    });
  });
  test("technician finalizes only their own signed-off report; immutable PDF prints statuses, limitations and photos", async ({
    page,
  }) => {
    expect(
      (
        await post(other, `/api/workflow/inspections/${inspectionId}/signoff`, {
          confirmed: true,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(tech, `/api/workflow/inspections/${inspectionId}/finalize`)
      ).status(),
    ).toBe(409);
    await page.context().addCookies((await tech.storageState()).cookies);
    await page.goto(`/inspections/${inspectionId}`);
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Technician sign-off", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Finalize inspection PDF",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await post(other, `/api/workflow/inspections/${inspectionId}/finalize`)
      ).status(),
    ).toBe(403);
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Finalize inspection PDF", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Download PDF", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const row = await db.inspection.findUniqueOrThrow({
      where: { id: inspectionId },
      include: { document: { include: { versions: true } } },
    });
    expect(row.finalizedAt).not.toBeNull();
    const { file, text } = await capturePdf(
      await staffPdf(tech, row.documentId),
      "inspection-pdf",
    );
    const normalized = text.replace(/\s+/g, " ");
    for (const word of [
      "PASS",
      "FAIL",
      "N/A",
      "NOT INSPECTED",
      "DEMO ONLY — upper flue and concealed areas could not be examined.",
    ])
      expect(normalized).toContain(word);
    expect(normalized).toContain(DISCLAIMERS.inspection);
    expect(
      execFileSync("pdfimages", ["-list", file], { encoding: "utf8" }),
    ).toContain("1600");
    expect(text.split("").filter((x) => x.trim()).length).toBeGreaterThan(1);
    execFileSync("pdftoppm", [
      "-f",
      "2",
      "-singlefile",
      "-png",
      "-r",
      "110",
      file,
      "docs/screenshots/phase-c-inspection-page-two",
    ]);
    expect(
      (
        await tech.patch(`/api/workflow/inspections/${inspectionId}`, {
          headers,
          data: { limitations: "changed" },
        })
      ).status(),
    ).toBe(400);
    await expect(
      db.documentVersion.update({
        where: { id: row.document.versions[0].id },
        data: { snapshot: {} },
      }),
    ).rejects.toThrow(/immutable/);
  });
  test("customer anonymously reviews, affirms consent and signs the exact estimate version", async ({
    browser,
  }) => {
    const e = await ok<EstimateDTO>(
      await post(office, "/api/estimates", estimateBody()),
      201,
    );
    estimateId = e.id;
    await ok(await post(office, `/api/estimates/${estimateId}/issue`));
    const original = await db.documentVersion.findFirstOrThrow({
      where: { documentId: e.documentId },
    });
    const originalBytes = await staffPdf(office, e.documentId);
    const share = await ok<ShareDTO>(
      await post(office, `/api/workflow/documents/${e.documentId}/share`),
      201,
    );
    shareToken = new URL(share.url).pathname.split("/").pop()!;
    const token = await db.documentShareToken.findUniqueOrThrow({
      where: { id: share.id },
    });
    expect(shareToken.length).toBe(43);
    expect(token.tokenHash).toBe(
      createHash("sha256").update(shareToken).digest("hex"),
    );
    expect(token.tokenHash).not.toBe(shareToken);
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(share.url);
    await expect(
      page.getByRole("button", { name: "Approve & Sign", exact: true }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(
      "PRIVATE-DO-NOT-SHARE",
    );
    const viewed = await db.documentShareToken.findUniqueOrThrow({
      where: { id: share.id },
    });
    expect(viewed.firstViewedAt).not.toBeNull();
    expect(viewed.viewCount).toBeGreaterThan(0);
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: estimateId } }))
        .status,
    ).toBe("VIEWED");
    await page
      .getByLabel("Your name", { exact: true })
      .fill("DEMO ONLY Customer Signer");
    await page.getByLabel("Email (optional)").fill("demo.signer@example.test");
    await page
      .getByLabel("Type your name as your signature")
      .fill("DEMO ONLY Customer Signer");
    await page
      .getByRole("button", { name: "Approve & Sign", exact: true })
      .click();
    await expect(page.locator(".error[role=alert]")).toContainText("consent");
    await page
      .getByLabel("I affirm the electronic-signature consent above.")
      .check();
    await expect(page.locator(".error[role=alert]")).toHaveCount(0);
    await page.screenshot({
      path: "docs/screenshots/phase-c-customer-signing.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Approve & Sign", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Signature recorded", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const download = page.getByRole("link", {
      name: "Download signed PDF",
      exact: true,
    });
    const signedHref = (await download.getAttribute("href"))!;
    signedToken = signedHref.split("/")[3];
    const signed = await ctx.request.get(signedHref);
    expect(signed.status()).toBe(200);
    const certificateHref = (await page
      .getByRole("link", { name: "Download approval certificate", exact: true })
      .getAttribute("href"))!;
    const row = await db.estimate.findUniqueOrThrow({
      where: { id: estimateId },
      include: {
        document: { include: { versions: { orderBy: { version: "desc" } } } },
      },
    });
    expect(row.status).toBe("APPROVED");
    expect(row.document.versions).toHaveLength(2);
    const v = row.document.versions[0];
    expect(
      createHash("sha256")
        .update(await signed.body())
        .digest("hex"),
    ).toBe(v.contentHash);
    const signature = await db.signature.findFirstOrThrow({
      where: { documentVersionId: v.id },
    });
    expect(signature.typedName).toBe("DEMO ONLY Customer Signer");
    expect(signature.shareTokenId).toBe(share.id);
    expect(
      await db.consentRecord.count({
        where: { documentVersionId: v.id, consentTextVersion: CONSENT_VERSION },
      }),
    ).toBe(1);
    expect(
      (
        await db.documentVersion.findUniqueOrThrow({
          where: { id: original.id },
        })
      ).snapshot,
    ).toEqual(original.snapshot);
    const oldFile = await db.fileAsset.findUniqueOrThrow({
      where: { id: original.pdfFileId! },
    });
    expect(
      await readFile(
        path.resolve(
          process.env.PRIVATE_STORAGE_DIR ?? "private/uploads",
          oldFile.storageKey,
        ),
      ),
    ).toEqual(originalBytes);
    expect((await anon.get(`/api/share/${shareToken}`)).status()).toBe(404);
    expect(
      (
        await post(anon, `/api/share/${signedToken}`, {
          action: "APPROVE",
          name: "DEMO",
          typedName: "DEMO",
          consent: true,
          consentVersion: CONSENT_VERSION,
        })
      ).status(),
    ).toBe(409);
    const cert = await anon.get(certificateHref);
    expect(cert.status()).toBe(200);
    const { text } = await capturePdf(
      await cert.body(),
      "approval-certificate",
    );
    expect(text).toContain("APPROVAL CERTIFICATE");
    expect(text).toContain(v.contentHash!);
    await expect(
      db.signature.update({
        where: { id: signature.id },
        data: { signerName: "tampered" },
      }),
    ).rejects.toThrow(/append-only/);
    await ctx.close();
  });
  test("Scenario F converts approved amounts without repricing and records the $1,000 check through the UI", async ({
    page,
  }) => {
    await db.organizationSettings.update({
      where: { organizationId: orgId },
      data: {
        taxEnabled: true,
        feeEnabled: true,
        taxRateBasisPoints: 825,
        feeRateBasisPoints: 400,
      },
    });
    await page.context().addCookies((await office.storageState()).cookies);
    await page.goto(`/estimates/${estimateId}`);
    await page
      .getByRole("link", {
        name: "Convert approved estimate to invoice",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Save invoice draft", exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/new/);
    invoiceId = page.url().split("/").pop()!;
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.sourceEstimateId).toBe(estimateId);
    expect(invoice.totalCents).toBe(442500);
    expect(invoice.taxCents).toBe(0);
    expect(invoice.feeCents).toBe(0);
    expect(await db.receipt.count({ where: { invoiceId } })).toBe(0);
    await expect(
      db.receipt.create({
        data: {
          documentId: invoice.documentId,
          invoiceId,
          paymentId: "nonexistent",
          balanceAfterCents: 342500,
        },
      }),
    ).rejects.toThrow();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Issue invoice PDF", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Record received payment",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Amount (integer cents)").fill("100000");
    await page.getByLabel(/^Method/).selectOption("CHECK");
    await page.getByLabel("Reference", { exact: true }).fill("DEMO check 1001");
    await page
      .getByLabel("I confirm this money has already been received elsewhere.")
      .check();
    await page
      .getByRole("button", {
        name: "Record payment and generate receipt",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/receipts\//, { timeout: 30000 });
    receiptId = page.url().split("/").pop()!;
    const row = await db.receipt.findUniqueOrThrow({
      where: { id: receiptId },
    });
    paymentId = row.paymentId;
    expect(row.balanceAfterCents).toBe(342500);
    const read = await ok<InvoiceDTO>(
      await office.get(`/api/workflow/invoices/${invoiceId}`),
    );
    expect(read.amountPaidCents).toBe(100000);
    expect(read.balanceCents).toBe(342500);
    expect(read.status).toBe("PARTIALLY_PAID");
    const { text } = await capturePdf(
      await staffPdf(office, row.documentId),
      "receipt-pdf",
    );
    expect(text).toContain("$1,000.00");
    expect(text).toContain("$3,425.00");
    expect(text.replace(/\s+/g, " ")).toContain(DISCLAIMERS.receipt);
    const invPdf = await capturePdf(
      await staffPdf(office, invoice.documentId),
      "invoice-pdf",
    );
    expect(invPdf.text).toContain("$3,425.00");
    expect(invPdf.text.replace(/\s+/g, " ")).toContain(DISCLAIMERS.invoice);
    expect(
      (
        await post(tech, `/api/workflow/invoices/${invoiceId}/payments`, {
          amountCents: 1,
          method: "CASH",
          paidAt: new Date().toISOString(),
          received: true,
        })
      ).status(),
    ).toBe(403);
    const link = await ok<ShareDTO>(
      await post(office, `/api/workflow/documents/${row.documentId}/share`),
      201,
    );
    receiptShareToken = new URL(link.url).pathname.split("/").pop()!;
    await db.organizationSettings.update({
      where: { organizationId: orgId },
      data: { taxEnabled: false, feeEnabled: false },
    });
  });
  test("reversal preserves money facts and appends a void receipt; invoices are voided only with reason", async () => {
    const before = await db.receipt.findUniqueOrThrow({
      where: { id: receiptId },
      include: { document: { include: { versions: true } } },
    });
    expect(
      (
        await post(office, `/api/workflow/invoices/${invoiceId}/void`, {
          reason: "DEMO",
        })
      ).status(),
    ).toBe(409);
    await expect(
      db.paymentRecord.update({
        where: { id: paymentId },
        data: { amountCents: 1 },
      }),
    ).rejects.toThrow(/immutable/);
    await ok(
      await post(
        office,
        `/api/workflow/invoices/${invoiceId}/payments/${paymentId}`,
        { reason: "DEMO duplicate record correction" },
      ),
    );
    const invoice = await ok<InvoiceDTO>(
      await office.get(`/api/workflow/invoices/${invoiceId}`),
    );
    expect(invoice.amountPaidCents).toBe(0);
    expect(invoice.balanceCents).toBe(442500);
    const receipt = await ok<ReceiptDTO>(
      await office.get(`/api/workflow/receipts/${receiptId}`),
    );
    expect(receipt.status).toBe("VOID");
    expect(receipt.document.versions).toHaveLength(2);
    expect(
      snapshotSchema.parse(receipt.document.versions[0].snapshot).receipt!
        .voidReason,
    ).toContain("DEMO");
    expect(
      (
        await db.documentVersion.findUniqueOrThrow({
          where: { id: before.document.versions[0].id },
        })
      ).snapshot,
    ).toEqual(before.document.versions[0].snapshot);
    expect((await anon.get(`/api/share/${receiptShareToken}`)).status()).toBe(
      404,
    );
    expect(
      (
        await post(office, `/api/workflow/invoices/${invoiceId}/void`, {
          reason: "",
        })
      ).status(),
    ).toBe(400);
    await ok(
      await post(office, `/api/workflow/invoices/${invoiceId}/void`, {
        reason: "DEMO invoice withdrawn",
      }),
    );
    expect(
      (
        await ok<InvoiceDTO>(
          await office.get(`/api/workflow/invoices/${invoiceId}`),
        )
      ).status,
    ).toBe("VOID");
    expect(
      (
        await post(office, `/api/workflow/invoices/${invoiceId}/payments`, {
          amountCents: 1,
          method: "CASH",
          paidAt: new Date().toISOString(),
          received: true,
        })
      ).status(),
    ).toBe(409);
  });
  test("revoked, expired and unknown capabilities have identical responses; token versions cannot broaden", async () => {
    const base = await ok<EstimateDTO>(
      await post(office, "/api/estimates", estimateBody()),
      201,
    );
    await ok(await post(office, `/api/estimates/${base.id}/issue`));
    const revoked = await ok<ShareDTO>(
      await post(office, `/api/workflow/documents/${base.documentId}/share`),
      201,
    );
    const expired = await ok<ShareDTO>(
      await post(office, `/api/workflow/documents/${base.documentId}/share`),
      201,
    );
    await db.documentShareToken.update({
      where: { id: expired.id },
      data: { expiresAt: new Date("2020-01-01") },
    });
    await ok(
      await office.delete(
        `/api/workflow/documents/${base.documentId}/shares/${revoked.id}`,
        { headers },
      ),
    );
    const tokens = [
      new URL(revoked.url).pathname.split("/").pop()!,
      new URL(expired.url).pathname.split("/").pop()!,
      randomBytes(32).toString("base64url"),
    ];
    const bodies = [];
    for (const token of tokens) {
      const r = await anon.get(`/api/share/${token}`);
      expect(r.status()).toBe(404);
      bodies.push(await r.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(
      (await anon.get(`/api/share/${signedToken}/../invoices`)).status(),
    ).not.toBe(200);
    expect(
      (
        await anon.get(
          `/api/share/${signedToken}/pdf?documentId=${base.documentId}`,
        )
      ).status(),
    ).toBe(200);
    const signed = await ok<PublicDTO>(
      await anon.get(`/api/share/${signedToken}`),
    );
    expect(signed.snapshot.document.id).not.toBe(base.documentId);
  });
  test("scratch invoice edits, computed overdue and concurrent payments cannot overpay", async () => {
    const payload = {
      draft: {
        ...estimateBody(),
        lineItems: [
          {
            title: "DEMO scratch invoice",
            quantity: "1",
            unitPriceCents: 10000,
          },
        ],
      },
      dueDate: "2020-01-01",
    };
    expect(
      (
        await post(office, "/api/workflow/invoices", {
          ...payload,
          amountPaidCents: 1,
        })
      ).status(),
    ).toBe(400);
    const inv = await ok<InvoiceDTO>(
      await post(office, "/api/workflow/invoices", payload),
      201,
    );
    await ok(
      await office.patch(`/api/workflow/invoices/${inv.id}`, {
        headers,
        data: { ...payload, notes: "DEMO edited scratch" },
      }),
    );
    await ok(await post(office, `/api/workflow/invoices/${inv.id}/issue`));
    expect(
      (
        await ok<InvoiceDTO>(
          await office.get(`/api/workflow/invoices/${inv.id}`),
        )
      ).status,
    ).toBe("OVERDUE");
    const results = await Promise.all(
      [1, 2].map((i) =>
        post(office, `/api/workflow/invoices/${inv.id}/payments`, {
          amountCents: 7000,
          method: "CASH",
          paidAt: new Date().toISOString(),
          reference: `DEMO concurrent ${i}`,
          received: true,
        }),
      ),
    );
    expect(results.map((r) => r.status()).sort()).toEqual([201, 400]);
    const read = await ok<InvoiceDTO>(
      await office.get(`/api/workflow/invoices/${inv.id}`),
    );
    expect(read.amountPaidCents).toBe(7000);
    expect(read.balanceCents).toBe(3000);
    expect(await db.receipt.count({ where: { invoiceId: inv.id } })).toBe(1);
  });
  test("dryer checklist, customer acknowledgment and selected FAIL repairs use no invented price", async ({
    page,
  }) => {
    const dryer = await inspectionDraft("DRYER_VENT");
    expect(dryer.sections).toHaveLength(5);
    const row = await ok<InspectionDTO>(
      await tech.get(`/api/workflow/inspections/${inspectionId}`),
    );
    const fail = row.sections
      .flatMap((s) => s.findings)
      .find((f: { status: string }) => f.status === "FAIL");
    if (!fail)
      throw new Error("Expected a FAIL finding in the inspection fixture.");
    const selected = await ok<{ lines: { unitPriceCents: null }[] }>(
      await post(tech, `/api/workflow/inspections/${inspectionId}/repairs`, {
        findingIds: [fail.id],
      }),
    );
    expect(selected.lines[0].unitPriceCents).toBeNull();
    await page.context().addCookies((await office.storageState()).cookies);
    await page.goto(`/inspections/${inspectionId}`);
    await expect(
      page.getByRole("checkbox", { name: fail.title, exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel("Explicit price (integer cents)")).toHaveValue(
      "",
    );

    expect(
      (
        await post(tech, `/api/workflow/inspections/${inspectionId}/repairs`, {
          findingIds: [fail.id],
          prices: [{ findingId: fail.id, unitPriceCents: 12345 }],
        })
      ).status(),
    ).toBe(403);
    const estimate = await ok<EstimateDTO>(
      await post(office, `/api/workflow/inspections/${inspectionId}/repairs`, {
        findingIds: [fail.id],
        prices: [{ findingId: fail.id, unitPriceCents: 12345 }],
      }),
    );
    expect(estimate.totalCents).toBe(12345);
    const link = await ok<ShareDTO>(
      await post(tech, `/api/workflow/documents/${row.documentId}/share`),
      201,
    );
    const token = new URL(link.url).pathname.split("/").pop()!;
    await ok(
      await post(anon, `/api/share/${token}`, {
        action: "APPROVE",
        name: "DEMO Report Recipient",
        typedName: "DEMO Report Recipient",
        consent: true,
        consentVersion: CONSENT_VERSION,
      }),
    );
    const latest = await db.documentVersion.findFirstOrThrow({
      where: { documentId: row.documentId },
      orderBy: { version: "desc" },
    });
    expect(
      await db.signature.count({
        where: { documentVersionId: latest.id, action: "ACKNOWLEDGE" },
      }),
    ).toBe(1);
  });
  test("checklist configuration is admin-only and share requests are rate-limited", async () => {
    const checklist = [
      { key: "demo_check", title: "DEMO configurable checklist item" },
    ];
    expect(
      (
        await post(tech, "/api/workflow/inspections/templates", {
          kind: "DRYER_VENT",
          checklist,
        })
      ).status(),
    ).toBe(403);
    await ok(
      await post(admin, "/api/workflow/inspections/templates", {
        kind: "DRYER_VENT",
        checklist,
      }),
    );
    const dryer = await inspectionDraft("DRYER_VENT");
    expect(dryer.sections).toHaveLength(1);
    const token = randomBytes(32).toString("base64url");
    let last = 404;
    for (let i = 0; i < 61; i++)
      last = (await anon.get(`/api/share/${token}`)).status();
    expect(last).toBe(429);
  });
  test("decline is separate from signing and concurrent approvals append only one signed version", async () => {
    const declined = await ok<EstimateDTO>(
      await post(office, "/api/estimates", estimateBody()),
      201,
    );
    await ok(await post(office, `/api/estimates/${declined.id}/issue`));
    const link = await ok<ShareDTO>(
      await post(
        office,
        `/api/workflow/documents/${declined.documentId}/share`,
      ),
      201,
    );
    const token = new URL(link.url).pathname.split("/").pop()!;
    await ok(
      await post(anon, `/api/share/${token}`, {
        action: "DECLINE",
        name: "DEMO Customer",
        consentVersion: CONSENT_VERSION,
        reason: "DEMO request a scope change",
      }),
    );
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: declined.id } }))
        .status,
    ).toBe("DECLINED");
    expect(
      await db.consentRecord.count({
        where: { documentVersion: { documentId: declined.documentId } },
      }),
    ).toBe(0);
    expect((await anon.get(`/api/share/${token}`)).status()).toBe(404);
    await db.organizationSettings.update({
      where: { organizationId: orgId },
      data: { estimateSignatureRequired: true },
    });
    const race = await ok<EstimateDTO>(
      await post(office, "/api/estimates", estimateBody()),
      201,
    );
    await ok(await post(office, `/api/estimates/${race.id}/issue`));
    await ok(
      await post(office, `/api/estimates/${race.id}/status`, {
        status: "SENT",
      }),
    );
    await ok(
      await post(office, `/api/estimates/${race.id}/status`, {
        status: "VIEWED",
      }),
    );
    expect(
      (
        await post(office, `/api/estimates/${race.id}/status`, {
          status: "APPROVED",
        })
      ).status(),
    ).toBe(409);
    const share = await ok<ShareDTO>(
      await post(office, `/api/workflow/documents/${race.documentId}/share`),
      201,
    );
    const cap = new URL(share.url).pathname.split("/").pop()!;
    const result = await Promise.all(
      [1, 2].map((i) =>
        post(anon, `/api/share/${cap}`, {
          action: "APPROVE",
          name: `DEMO race ${i}`,
          typedName: `DEMO race ${i}`,
          consent: true,
          consentVersion: CONSENT_VERSION,
        }),
      ),
    );
    expect(result.map((r) => r.status()).sort()).toEqual([200, 404]);
    expect(
      await db.documentVersion.count({
        where: { documentId: race.documentId },
      }),
    ).toBe(2);
    expect(
      await db.signature.count({
        where: {
          documentVersion: { documentId: race.documentId },
          action: "APPROVE",
        },
      }),
    ).toBe(1);
  });
  test("invoice and receipt reads and payment writes cannot cross organizations", async () => {
    const foreign = await db.organization.create({
      data: {
        name: "DEMO ONLY Foreign Organization",
        brandName: "DEMO",
        phone: "",
        email: "",
        website: "",
        addrLine1: "DEMO",
        city: "DEMO",
        state: "TX",
        postal: "00000",
        users: {
          create: {
            name: "DEMO Foreign Office",
            email: `demo.foreign.${stamp}@example.test`,
            role: "OFFICE",
            passwordHash: await hash(randomBytes(32).toString("base64url"), 12),
          },
        },
      },
      include: { users: true },
    });
    const c = await db.customer.create({
      data: {
        organizationId: foreign.id,
        name: "DEMO ONLY Foreign Customer",
        tags: ["DEMO"],
      },
    });
    const p = await db.property.create({
      data: {
        customerId: c.id,
        line1: "DEMO ONLY foreign address",
        city: "DEMO",
        state: "TX",
        postal: "00000",
      },
    });
    const d = await db.document.create({
      data: {
        organizationId: foreign.id,
        type: "INVOICE",
        number: `DEMO-FOREIGN-${stamp}`,
      },
    });
    const invoice = await db.invoice.create({
      data: {
        documentId: d.id,
        customerId: c.id,
        propertyId: p.id,
        totalCents: 100,
        balanceCents: 100,
      },
    });
    const payment = await db.paymentRecord.create({
      data: {
        invoiceId: invoice.id,
        amountCents: 1,
        method: "CASH",
        paidAt: new Date(),
        recordedById: foreign.users[0].id,
        note: "DEMO ONLY test fixture",
      },
    });
    const rd = await db.document.create({
      data: {
        organizationId: foreign.id,
        type: "RECEIPT",
        number: `DEMO-FOREIGN-RECEIPT-${stamp}`,
      },
    });
    const receipt = await db.receipt.create({
      data: {
        documentId: rd.id,
        invoiceId: invoice.id,
        paymentId: payment.id,
        balanceAfterCents: 99,
      },
    });
    expect(
      (await office.get(`/api/workflow/invoices/${invoice.id}`)).status(),
    ).toBe(404);
    expect(
      (await office.get(`/api/workflow/receipts/${receipt.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await post(office, `/api/workflow/invoices/${invoice.id}/payments`, {
          amountCents: 1,
          method: "CASH",
          paidAt: new Date().toISOString(),
          received: true,
        })
      ).status(),
    ).toBe(404);
  });
});
