import "dotenv/config";
import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const base = "http://localhost:3003",
  headers = { origin: base };
const db = new PrismaClient({
  datasources: { db: { url: process.env.PHASE_E_DATABASE_URL } },
});
let api: APIRequestContext,
  ownerId: string,
  customerId: string,
  propertyId: string,
  jobId: string,
  inspectionId: string,
  estimateId: string;
let certificatePath: string;
const email = "demo.phase-e.owner@example.test",
  password = process.env.SEED_DEMO_PASSWORD!;
const fixtureLines = [
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
async function post(path: string, data: unknown) {
  const r = await api.post(path, { headers, data });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function signIn(ctx: APIRequestContext) {
  const csrf = await (await ctx.get("/api/auth/csrf")).json();
  await ctx.post("/api/auth/callback/credentials", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: base + "/dashboard",
    },
  });
}
async function shot(page: import("@playwright/test").Page, name: string) {
  if (name !== "loading")
    await expect(page.locator(".loading-state")).toHaveCount(0);
  await page.screenshot({
    path: `docs/screenshots/phase-e-${name}.png`,
    fullPage: true,
  });
}
test.describe
  .serial("Phase E real production build and empty-database setup", () => {
  test.beforeAll(async () => {
    await mkdir("docs/screenshots", { recursive: true });
    api = await request.newContext({ baseURL: base });
  });
  test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus && !page.isClosed()) {
      await page.screenshot({
        path: "/tmp/phase-e-failure.png",
        fullPage: true,
      });
    }
  });
  test.afterAll(async () => {
    await api?.dispose();
    await db.$disconnect();
  });
  test("first owner bootstraps without demo data and completes the three-step setup on a phone", async ({
    page,
  }) => {
    expect(await db.user.count()).toBe(0);
    await page.goto("/setup");
    await shot(page, "first-run-owner");
    await page
      .getByLabel("Setup code")
      .fill("DEMO_ONLY_BOOTSTRAP_TEST_TOKEN_2026");
    await page.getByLabel("Your name").fill("DEMO ONLY Solo Owner");
    await page.getByLabel("Owner email").fill(email);
    await page.getByLabel("Create password (16–72 characters)").fill(password);
    await page.getByRole("button", { name: "Create owner account" }).click();
    await expect(
      page.getByRole("heading", { name: "Your first morning with Texan Flue" }),
    ).toBeVisible();
    expect(await db.user.count()).toBe(1);
    expect(await db.customer.count()).toBe(0);
    expect(await db.serviceCatalogItem.count()).toBe(19);
    expect(await db.servicePriceVersion.count()).toBe(0);
    expect(await db.user.findFirstOrThrow()).toMatchObject({
      role: "ADMIN",
      email,
    });
    ownerId = (await db.user.findFirstOrThrow()).id;
    await shot(page, "first-run-company");
    await page
      .getByRole("button", { name: "Confirm company and continue" })
      .click();
    await shot(page, "first-run-logo");
    await page.getByRole("button", { name: "Keep supplied logo" }).click();
    await shot(page, "first-run-library");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page
      .getByRole("button", { name: "Finish setup and open dashboard" })
      .click();
    await expect(page).toHaveURL(/dashboard/);
    await shot(page, "first-run-dashboard");
    expect(
      (await db.organizationSettings.findFirstOrThrow()).onboardingCompletedAt,
    ).not.toBeNull();
    await signIn(api);
  });
  test("empty screens describe purpose and action; populated screens have no horizontal overflow at 375px", async ({
    page,
  }) => {
    await page.context().addCookies((await api.storageState()).cookies);
    for (const route of [
      "customers",
      "properties",
      "jobs",
      "estimates",
      "invoices",
      "inspections",
      "receipts",
      "files",
    ]) {
      await page.goto("/" + route);
      await expect(page.locator(".empty-state")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= 375),
      ).toBe(true);
      await shot(page, route + "-empty");
    }
    const c = await post("/api/data/customers", {
      name: "DEMO ONLY Roof Recovery Customer",
    });
    customerId = c.id;
    const p = await post("/api/data/properties", {
      customerId,
      line1: "DEMO ONLY 1 Recovery Lane",
      city: "Dallas",
      state: "TX",
      postal: "75204",
    });
    propertyId = p.id;
    const j = await post("/api/data/jobs", {
      customerId,
      propertyId,
      title: "DEMO ONLY Roof Recovery Job",
    });
    jobId = j.id;
    await post(`/api/data/jobs/${jobId}/assignments`, { userId: ownerId });
    const i = await post("/api/workflow/inspections", {
      customerId,
      propertyId,
      jobId,
      technicianId: ownerId,
      kind: "CHIMNEY",
      performedAt: new Date().toISOString(),
      weather: "DEMO clear",
    });
    inspectionId = i.id;
    const e = await post("/api/estimates", {
      customerId,
      propertyId,
      jobId,
      lineItems: fixtureLines,
      validUntil: "2027-01-01",
    });
    estimateId = e.id;
    const inv = await post("/api/workflow/invoices", {
      draft: { customerId, propertyId, jobId, lineItems: fixtureLines },
      dueDate: "2027-01-01",
    });
    await post(`/api/workflow/invoices/${inv.id}/issue`, {});
    await post(`/api/workflow/invoices/${inv.id}/payments`, {
      amountCents: 100000,
      method: "CHECK",
      paidAt: new Date().toISOString(),
      reference: "DEMO ONLY",
      note: "DEMO ONLY",
      received: true,
    });
    for (const route of [
      "dashboard",
      "customers",
      "properties",
      "jobs",
      "estimates",
      "invoices",
      "inspections",
      "receipts",
      "services",
      "settings/company",
      "settings/audit",
    ]) {
      await page.goto("/" + route);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= 375),
        route,
      ).toBe(true);
      await shot(page, route.replaceAll("/", "-") + "-populated");
    }
  });
  test("lost connection preserves inspection edits across reload, syncs, and detects a conflicting server edit", async ({
    page,
  }) => {
    await page.context().addCookies((await api.storageState()).cookies);
    await page.goto("/inspections/" + inspectionId);
    await page.context().setOffline(true);
    await page
      .getByRole("textbox", { name: "Firebox observation", exact: true })
      .fill("DEMO ONLY offline observation survives reconnect");
    await expect(page.locator(".offline-banner")).toContainText(
      "Saved on this device",
    );
    await page
      .getByRole("button", { name: "Save inspection", exact: true })
      .click();
    await expect(page.locator(".error[role=alert]")).toContainText("Offline");
    await shot(page, "inspection-offline");
    await page.context().setOffline(false);
    await expect
      .poll(
        async () =>
          (
            await db.inspectionFinding.findFirstOrThrow({
              where: { section: { inspectionId }, title: "Firebox" },
            })
          ).observation,
      )
      .toContain("survives reconnect");
    await page.route("**/api/workflow/inspections/" + inspectionId, (route) =>
      route.request().method() === "PATCH" ? route.abort() : route.continue(),
    );
    await page
      .getByRole("textbox", { name: "Firebox observation", exact: true })
      .fill("DEMO ONLY recovered after reload");
    await expect(page.locator(".offline-banner")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Firebox observation", exact: true }),
    ).toHaveValue("DEMO ONLY recovered after reload");
    await page.unroute("**/api/workflow/inspections/" + inspectionId);
    const current = await (
      await api.get("/api/workflow/inspections/" + inspectionId)
    ).json();
    await api.patch("/api/workflow/inspections/" + inspectionId, {
      headers,
      data: {
        limitations: current.limitations ?? "",
        summary: "DEMO other device changed summary",
        recommendations: current.recommendations ?? "",
        weather: current.weather ?? "",
        findings: current.sections
          .flatMap(
            (s: {
              findings: {
                id: string;
                status: string;
                severity: string | null;
                observation: string | null;
                recommendation: string | null;
              }[];
            }) => s.findings,
          )
          .map(
            (f: {
              id: string;
              status: string;
              severity: string | null;
              observation: string | null;
              recommendation: string | null;
            }) => ({
              ...f,
              observation: f.observation ?? "",
              recommendation: f.recommendation ?? "",
            }),
          )
          .map((f: Record<string, unknown>) => ({
            id: f.id,
            status: f.status,
            severity: f.severity,
            observation: f.observation,
            recommendation: f.recommendation,
          })),
      },
    });
    await page
      .getByRole("button", { name: "Save inspection", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review saved-version conflict" }),
    ).toBeVisible();
    await shot(page, "inspection-conflict");
    await page
      .getByRole("button", {
        name: "Confirm keeping my local edits over this server version",
      })
      .click();
    await expect(page.locator(".offline-banner")).toContainText(
      "Saved to server",
    );
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Firebox observation", exact: true }),
    ).toHaveValue("DEMO ONLY recovered after reload");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= 375),
    ).toBe(true);
  });
  test("individual photos are kept locally while offline and retry with progress", async ({
    page,
  }) => {
    await page.context().addCookies((await api.storageState()).cookies);
    await page.goto("/inspections/" + inspectionId);
    const details = page
      .locator("details")
      .filter({ hasText: "Add photo" })
      .first();
    await details.locator("summary").click();
    const queue = page.locator("[data-photo-queue]").first();
    await page.context().setOffline(true);
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#bbb" },
    })
      .png()
      .toBuffer();
    await queue.getByLabel("Photo", { exact: true }).setInputFiles({
      name: "DEMO-roof-evidence.png",
      mimeType: "image/png",
      buffer: png,
    });
    await queue
      .getByLabel("Caption", { exact: true })
      .fill("DEMO ONLY offline roof evidence");
    await queue
      .getByRole("button", { name: "Upload photo", exact: true })
      .click();
    await expect(
      queue.getByRole("button", { name: "Retry DEMO-roof-evidence.png" }),
    ).toBeVisible();
    await shot(page, "photo-queued");
    await page.context().setOffline(false);
    await page.waitForTimeout(300);
    const retry = queue.getByRole("button", {
      name: "Retry DEMO-roof-evidence.png",
    });
    if (await retry.count()) await retry.click();
    await expect
      .poll(() =>
        db.inspectionPhoto.count({
          where: { finding: { section: { inspectionId } } },
        }),
      )
      .toBe(1);
    await page.reload();
    await expect(
      page
        .locator("figcaption")
        .filter({ hasText: "DEMO ONLY offline roof evidence" }),
    ).toBeVisible();
  });
  test("failed actions preserve filled forms; session warning leaves work in place", async ({
    page,
  }) => {
    await page.context().addCookies((await api.storageState()).cookies);
    await page.goto("/customers/new");
    await page
      .getByLabel("Customer name")
      .fill("DEMO ONLY preserved customer entry");
    await page.route("**/api/data/customers", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Could not save. Your entries remain here. Check your connection and try again.",
        }),
      }),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByLabel("Customer name")).toHaveValue(
      "DEMO ONLY preserved customer entry",
    );
    await shot(page, "customer-error");
    const sessions = await db.session.findMany({ where: { userId: ownerId } });
    await db.session.updateMany({
      where: { userId: ownerId },
      data: { expiresAt: new Date(Date.now() + 60000) },
    });
    await page.reload();
    await page.getByLabel("Customer name").fill("DEMO ONLY keep this tab");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator(".session-warning")).toContainText(
      "will end soon",
    );
    await expect(page.getByLabel("Customer name")).toHaveValue(
      "DEMO ONLY keep this tab",
    );
    await shot(page, "session-warning");
    await db.session.updateMany({
      where: { userId: ownerId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator(".session-warning")).toContainText(
      "Your session ended",
    );
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Sign in in a new tab" }).click();
    const loginTab = await popupPromise;
    await loginTab.getByLabel("Email", { exact: true }).fill(email);
    await loginTab.getByLabel("Password", { exact: true }).fill(password);
    await loginTab
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(loginTab).toHaveURL(/dashboard/);
    await page
      .getByRole("button", { name: "Check connection and session" })
      .click();
    await expect(page.locator(".session-warning")).toHaveCount(0);
    await expect(page.getByLabel("Customer name")).toHaveValue(
      "DEMO ONLY keep this tab",
    );
    await loginTab.close();
    for (const session of sessions)
      await db.session.update({
        where: { id: session.id },
        data: { expiresAt: session.expiresAt },
      });
  });
  test("consent precedes typed signature and stores the exact version; solo ADMIN can finalize own report", async ({
    browser,
  }) => {
    await post(`/api/estimates/${estimateId}/issue`, {});
    const estimate = await db.estimate.findUniqueOrThrow({
      where: { id: estimateId },
    });
    const share = await post(
      `/api/workflow/documents/${estimate.documentId}/share`,
      {},
    );
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.goto(share.url);
    const disclosure = page.locator(".consent-disclosure");
    await expect(disclosure).toContainText("paper copy");
    await expect(disclosure).toContainText("withdraw");
    await expect(disclosure).toContainText("seven years");
    expect(
      await disclosure.evaluate((element) =>
        Boolean(
          element.compareDocumentPosition(
            document.querySelector('input[name="typedName"]') ??
              document.querySelector(
                '[aria-label="Type your name as your signature"]',
              )!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    await shot(page, "signing-disclosure");
    await page
      .getByLabel("Your name", { exact: true })
      .fill("DEMO ONLY Customer Signer");
    await page
      .getByLabel("Type your name as your signature")
      .fill("DEMO ONLY Customer Signer");
    await page
      .getByLabel("I affirm the electronic-signature consent above.")
      .check();
    await page
      .getByRole("button", { name: "Approve & Sign", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Signature recorded", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    certificatePath = (await page
      .getByRole("link", { name: "Download approval certificate", exact: true })
      .getAttribute("href"))!;
    const record = await db.consentRecord.findFirstOrThrow({
      where: { documentVersion: { documentId: estimate.documentId } },
    });
    const { CONSENT_TEXT, CONSENT_VERSION } =
      await import("../../src/lib/checklists");
    expect(record.consentText).toBe(CONSENT_TEXT);
    expect(record.consentTextVersion).toBe(CONSENT_VERSION);
    const i = await (
      await api.get("/api/workflow/inspections/" + inspectionId)
    ).json();
    await api.patch("/api/workflow/inspections/" + inspectionId, {
      headers,
      data: {
        limitations: "DEMO ONLY concealed areas not examined",
        summary: i.summary ?? "",
        recommendations: i.recommendations ?? "",
        weather: i.weather ?? "",
        findings: i.sections
          .flatMap((s: { findings: Record<string, unknown>[] }) => s.findings)
          .map((f: Record<string, unknown>) => ({
            id: f.id,
            status: f.status,
            severity: f.severity,
            observation: f.observation ?? "",
            recommendation: f.recommendation ?? "",
          })),
      },
    });
    await post("/api/workflow/inspections/" + inspectionId + "/signoff", {
      confirmed: true,
    });
    await post("/api/workflow/inspections/" + inspectionId + "/finalize", {});
    await context.close();
  });
  test("slow navigation displays the shared record skeleton", async ({
    page,
  }) => {
    await page.context().addCookies((await api.storageState()).cookies);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.goto("/dashboard");
    let locked = () => {};
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const transaction = db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'LOCK TABLE "Customer" IN ACCESS EXCLUSIVE MODE',
        );
        locked();
        await gate;
      },
      { timeout: 20000 },
    );
    await ready;
    try {
      await page
        .getByRole("link", { name: "Customers", exact: true })
        .click({ noWaitAfter: true });
      await expect(page.locator(".loading-state")).toBeVisible({
        timeout: 10000,
      });
      await shot(page, "loading");
    } finally {
      release();
      await transaction;
    }
    await expect(
      page.getByRole("heading", { name: "Customers", exact: true }),
    ).toBeVisible();
    // Deliberately break this disposable database's customer read, then restore it.
    await db.$executeRawUnsafe(
      'ALTER TABLE "Customer" RENAME TO "Customer_phase_e_unavailable"',
    );
    try {
      await page.goto("/customers");
      await expect(
        page.getByRole("heading", { name: "We couldn’t load this screen" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Try loading again" }),
      ).toBeVisible();
      await shot(page, "page-error");
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "Customer_phase_e_unavailable" RENAME TO "Customer"',
      );
    }
  });
  test("real Lighthouse accessibility scores reach 95 on the main screens", async () => {
    test.setTimeout(300000);
    const editable = await post("/api/workflow/inspections", {
      customerId,
      propertyId,
      jobId,
      technicianId: ownerId,
      kind: "CHIMNEY",
      performedAt: new Date().toISOString(),
      weather: "DEMO ONLY audit",
    });
    const { auditScreens } = await import("../../scripts/accessibility.mjs");
    const results = await auditScreens(
      base,
      (await api.storageState()).cookies,
      [
        ["login", "/login"],
        ["dashboard", "/dashboard"],
        ["customers", "/customers"],
        ["estimate-builder", "/estimates/new"],
        ["inspection", "/inspections/" + editable.id],
        ["privacy", "/legal/privacy"],
        ["setup", "/setup"],
      ],
    );
    for (const result of results)
      expect(result.score, JSON.stringify(result)).toBeGreaterThanOrEqual(95);
  });
  test("quarantined uploads validate before attaching and retry commits are idempotent", async () => {
    const bytes = await sharp({
      create: { width: 30, height: 30, channels: 3, background: "#888" },
    })
      .png()
      .toBuffer();
    const ticket = await post("/api/storage/intent", {
      filename: "DEMO-file.png",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      purpose: "FILE",
      resourceId: null,
      metadata: {},
    });
    await writeFile("/tmp/texan-phase-e-files/" + ticket.storageKey, bytes);
    const first = await post("/api/storage/commit", { id: ticket.id });
    const second = await post("/api/storage/commit", { id: ticket.id });
    expect(second.id).toBe(first.id);
    expect(await db.fileAsset.count({ where: { id: first.id } })).toBe(1);
    const invalid = await post("/api/storage/intent", {
      filename: "DEMO-bad.png",
      mimeType: "image/png",
      sizeBytes: 5,
      purpose: "FILE",
      resourceId: null,
      metadata: {},
    });
    await writeFile(
      "/tmp/texan-phase-e-files/" + invalid.storageKey,
      Buffer.from("wrong"),
    );
    expect(
      (
        await api.post("/api/storage/commit", {
          headers,
          data: { id: invalid.id },
        })
      ).status(),
    ).toBe(400);
    expect(
      (await db.uploadIntent.findUniqueOrThrow({ where: { id: invalid.id } }))
        .resultId,
    ).toBeNull();
  });
  test("ADMIN export contains records and private evidence; audit and privacy archive are real", async ({
    page,
  }) => {
    const result = await api.get(`/api/privacy/customers/${customerId}/export`);
    expect(result.status()).toBe(200);
    expect(result.headers()["content-type"]).toContain("zip");
    const bytes = await result.body();
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    await writeFile("/tmp/phase-e-customer-export.zip", bytes);
    const { execFileSync } = await import("node:child_process");
    const contents = execFileSync("unzip", [
      "-p",
      "/tmp/phase-e-customer-export.zip",
      "customer-records.json",
    ]).toString();
    expect(contents).toContain("DEMO ONLY Roof Recovery Customer");
    expect(contents).toContain("electronic-records-v2");
    await page.context().addCookies((await api.storageState()).cookies);
    await page.goto("/settings/audit");
    await expect(page.locator("body")).toContainText("EXPORT_CUSTOMER_RECORDS");
    await shot(page, "audit-log");
    expect(
      (
        await api.post(`/api/privacy/customers/${customerId}/archive`, {
          headers,
          data: { reason: "DEMO ONLY verified deletion review" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: customerId } }))
        .deletedAt,
    ).not.toBeNull();
    expect(await db.consentRecord.count()).toBeGreaterThan(0);
    const anonymous = await request.newContext({ baseURL: base });
    try {
      expect((await anonymous.get(certificatePath)).status()).toBe(404);
    } finally {
      await anonymous.dispose();
    }
  });
});
