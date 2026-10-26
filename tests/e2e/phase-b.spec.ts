import "dotenv/config";
import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  DEFAULT_ESTIMATE_LAYOUT,
  DISCLAIMERS,
} from "../../src/lib/template-contract";
const db = new PrismaClient();
const origin = process.env.AUTH_URL ?? "http://localhost:3000";
const password = process.env.SEED_DEMO_PASSWORD!;
let api: APIRequestContext,
  techApi: APIRequestContext,
  adminApi: APIRequestContext,
  orgId: string,
  customerId: string,
  propertyId: string,
  jobId: string,
  serviceId: string,
  estimateId: string,
  versionId: string,
  fileId: string;
const stamp = Date.now().toString();
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
async function login(email: string) {
  const client = await request.newContext({ baseURL: origin });
  const csrf = await (await client.get("/api/auth/csrf")).json();
  await client.post("/api/auth/callback/credentials", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: `${origin}/dashboard`,
    },
  });
  expect((await client.get("/api/data/dashboard")).ok()).toBeTruthy();
  return client;
}
const body = () => ({
  customerId,
  propertyId,
  jobId,
  lineItems: items.map((l, i) => ({
    ...l,
    serviceId: i === 0 ? serviceId : undefined,
  })),
  validUntil: "2027-12-31",
  terms: "DEMO payment and scheduling terms only.",
  exclusions: "DEMO additional work excluded.",
  assumptions: "DEMO accessible wood-burning chimney.",
  internalNote: "PRIVATE INTERNAL NOTE MUST NOT APPEAR",
});
async function post(
  client: APIRequestContext,
  url: string,
  data: unknown = {},
) {
  return client.post(url, { headers, data });
}
async function create(data: unknown = body()) {
  const r = await post(api, "/api/estimates", data);
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function pdfText(bytes: Buffer, name: string) {
  await mkdir("private/phase-b-evidence", { recursive: true });
  const file = path.resolve(`private/phase-b-evidence/${name}.pdf`);
  await writeFile(file, bytes);
  return {
    file,
    text: execFileSync("pdftotext", ["-layout", file, "-"], {
      encoding: "utf8",
    }),
  };
}
test.describe
  .serial("Phase B acceptance against PostgreSQL and real Chromium PDFs", () => {
  test.beforeAll(async () => {
    orgId = `demo-phase-b-${stamp}`;
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
        settings: {
          create: {
            taxEnabled: false,
            feeEnabled: false,
            defaultTerms: "DEMO",
          },
        },
      },
    });
    const passwordHash = await hash(password, 12);
    for (const role of ["OFFICE", "ADMIN", "TECHNICIAN"] as const) {
      await db.user.create({
        data: {
          organizationId: orgId,
          email: `demo.phaseb.${role.toLowerCase()}.${stamp}@example.test`,
          name: `DEMO Phase B ${role}`,
          role,
          passwordHash,
        },
      });
    }
    const customer = await db.customer.create({
      data: {
        organizationId: orgId,
        name: "DEMO ONLY — Fictional Hearth Household",
        billLine1: "DEMO ORIGINAL BILLING ADDRESS",
        billCity: "Dallas",
        billState: "TX",
        billPostal: "75204",
        tags: ["DEMO ONLY"],
      },
    });
    customerId = customer.id;
    const prop = await db.property.create({
      data: {
        customerId,
        line1: "DEMO ORIGINAL PROPERTY ADDRESS",
        city: "Dallas",
        state: "TX",
        postal: "75204",
      },
    });
    propertyId = prop.id;
    const tech = await db.user.findUniqueOrThrow({
      where: { email: `demo.phaseb.technician.${stamp}@example.test` },
    });
    const job = await db.job.create({
      data: {
        organizationId: orgId,
        customerId,
        propertyId,
        number: `DEMO-PHASEB-${stamp}`,
        title: "DEMO ONLY Phase B acceptance",
        assignments: { create: { userId: tech.id } },
      },
    });
    jobId = job.id;
    const service = await db.serviceCatalogItem.create({
      data: {
        organizationId: orgId,
        slug: "demo-sweep",
        title: "Chimney Sweep",
        category: "DEMO",
        description: "DEMO sweep",
        scopeSteps: [],
        materials: [],
        exclusions: [],
        priceVersions: {
          create: { unitPriceCents: 9900, note: "DEMO acceptance price" },
        },
      },
    });
    serviceId = service.id;
    api = await login(`demo.phaseb.office.${stamp}@example.test`);
    techApi = await login(`demo.phaseb.technician.${stamp}@example.test`);
    adminApi = await login(`demo.phaseb.admin.${stamp}@example.test`);
  });
  test.afterAll(async () => {
    await api?.dispose();
    await techApi?.dispose();
    await adminApi?.dispose();
    await db.$disconnect();
  });
  test("OFFICE builds scenario A through the UI and issues an exact $4,425.00 PDF", async ({
    page,
  }) => {
    await page.context().addCookies((await api.storageState()).cookies);
    await page.goto("/estimates/new");
    await page.getByLabel(/^Customer/).selectOption(customerId);
    await page.getByLabel(/^Property/).selectOption(propertyId);
    await page.getByLabel("Related job (optional)").selectOption(jobId);
    for (const item of items) {
      await page
        .getByRole("button", { name: "Add custom line", exact: true })
        .click();
      const fieldset = page.locator("fieldset").last();
      await fieldset
        .getByLabel("Service title", { exact: true })
        .fill(item.title);
      await fieldset
        .getByLabel("Quantity", { exact: true })
        .fill(item.quantity);
      await fieldset
        .getByLabel("Unit price (integer cents)", { exact: true })
        .fill(String(item.unitPriceCents));
    }
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).not.toHaveURL(/\/new$/);
    estimateId = page.url().split("/").pop()!;
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Issue estimate", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Total: $4,425.00", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const row = await db.estimate.findUniqueOrThrow({
      where: { id: estimateId },
      include: { document: { include: { versions: true } }, lineItems: true },
    });
    expect(row.lineItems).toHaveLength(3);
    expect(row.totalCents).toBe(442500);
    expect(row.status).toBe("READY");
    expect(row.document.number).toMatch(/^TF-EST-\d{4}-0001$/);
    const version = row.document.versions[0];
    versionId = version.id;
    fileId = version.pdfFileId!;
    const link = await (
      await api.get(`/api/estimates/${estimateId}/download`)
    ).json();
    const pdf = await api.get(link.url);
    expect(pdf.ok()).toBeTruthy();
    const bytes = await pdf.body();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      version.contentHash,
    );
    const { file, text } = await pdfText(bytes, "scenario-a");
    for (const expected of [
      "Chimney Sweep",
      "Glass Fireplace Doors",
      "(17x20 in)",
      "Refractory Panel",
      "Replacement",
      "$99.00",
      "$1,650.00",
      "$2,676.00",
      "$4,425.00",
      "Not included",
      "DEMO ORIGINAL BILLING ADDRESS",
      "DEMO ORIGINAL PROPERTY ADDRESS",
    ])
      expect(text.replace(/\s+/g, " ")).toContain(expected);
    expect(text.replace(/\s+/g, " ")).toContain(DISCLAIMERS.estimate);
    expect(text).not.toContain("PRIVATE INTERNAL NOTE");
    const fonts = execFileSync("pdffonts", [file], { encoding: "utf8" });
    expect(fonts).toMatch(/LibreBaskerville/);
    expect(fonts).toMatch(/SourceSans/);
    for (const l of fonts
      .split("\n")
      .slice(2)
      .filter((l) => l.trim()))
      expect(l).toMatch(/yes\s+yes/);
    await mkdir("docs/screenshots", { recursive: true });
    execFileSync("pdftoppm", [
      "-f",
      "1",
      "-singlefile",
      "-png",
      "-r",
      "120",
      file,
      "docs/screenshots/phase-b-estimate-first-page",
    ]);
  });
  test("issued snapshots survive changes to customer, property, catalog price and template; SQL mutation is rejected", async () => {
    // Use a catalog-linked estimate as well as the UI-produced acceptance estimate.
    const linked = await create();
    const response = await post(api, `/api/estimates/${linked.id}/issue`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const before = await db.documentVersion.findFirstOrThrow({
      where: { documentId: linked.documentId },
    });
    await db.customer.update({
      where: { id: customerId },
      data: { billLine1: "DEMO CHANGED BILLING ADDRESS" },
    });
    await db.property.update({
      where: { id: propertyId },
      data: { line1: "DEMO CHANGED PROPERTY ADDRESS" },
    });
    await db.servicePriceVersion.updateMany({
      where: { serviceId },
      data: { unitPriceCents: 999999 },
    });
    const layout = structuredClone(DEFAULT_ESTIMATE_LAYOUT);
    const heading = layout.blocks.find((b) => b.type === "docTitle")!;
    if (heading.type === "docTitle")
      heading.options.label = "DEMO CHANGED TEMPLATE";
    expect(
      (await post(adminApi, "/api/estimates/templates", layout)).ok(),
    ).toBeTruthy();
    await db.templateVersion.update({
      where: { id: before.templateVersionId! },
      data: { source: JSON.stringify(layout) },
    });
    const preview = await api.get(`/api/estimates/${linked.id}/preview`);
    expect(preview.ok()).toBeTruthy();
    const { text } = await pdfText(await preview.body(), "immutable-rerender");
    expect(text).toContain("DEMO ORIGINAL BILLING ADDRESS");
    expect(text).toContain("DEMO ORIGINAL PROPERTY ADDRESS");
    expect(text).toContain("$99.00");
    expect(text).toContain("$4,425.00");
    expect(text).not.toContain("DEMO CHANGED");
    expect(text).not.toContain("$9,999.99");
    expect(
      (await db.documentVersion.findUniqueOrThrow({ where: { id: before.id } }))
        .snapshot,
    ).toEqual(before.snapshot);
    await expect(
      db.$executeRaw`UPDATE "DocumentVersion" SET snapshot='{}'::jsonb WHERE id=${before.id}`,
    ).rejects.toThrow(/immutable/);
    await expect(
      db.$executeRaw`UPDATE "FileAsset" SET "deletedAt"=now() WHERE id=${fileId}`,
    ).rejects.toThrow(/immutable/);
    expect(
      (
        await api.patch(`/api/estimates/${linked.id}`, {
          headers,
          data: body(),
        })
      ).status(),
    ).toBe(409);
  });
  test("revision links a new estimate/version, duplicate stays independent and original PDF remains readable", async () => {
    const r = await post(api, `/api/estimates/${estimateId}/revise`);
    expect(r.status(), await r.text()).toBe(201);
    const revised = await r.json();
    expect(revised.id).not.toBe(estimateId);
    expect(revised.documentId).not.toBe(
      (await db.estimate.findUniqueOrThrow({ where: { id: estimateId } }))
        .documentId,
    );
    expect(revised.status).toBe("DRAFT");
    expect(revised.document.versions).toHaveLength(1);
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: estimateId } }))
        .supersededById,
    ).toBe(revised.id);
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: estimateId } }))
        .status,
    ).toBe("SUPERSEDED");
    const old = await db.documentVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    expect(old.issuedAt).not.toBeNull();
    expect(
      (await api.get(`/api/estimates/${estimateId}/download`)).ok(),
    ).toBeTruthy();
    expect(
      (
        await api.patch(`/api/estimates/${revised.id}`, {
          headers,
          data: { ...body(), terms: "DEMO revised terms" },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (await post(api, `/api/estimates/${revised.id}/issue`)).ok(),
    ).toBeTruthy();
    const duplicate = await post(api, `/api/estimates/${revised.id}/duplicate`);
    expect(duplicate.status()).toBe(201);
    expect((await duplicate.json()).supersedes).toBeNull();
  });
  test("TECHNICIAN cannot issue or edit; assigned reads work and unassigned estimates return 404", async () => {
    const draft = await create();
    expect((await techApi.get(`/api/estimates/${draft.id}`)).ok()).toBeTruthy();
    expect(
      (await post(techApi, `/api/estimates/${draft.id}/issue`)).status(),
    ).toBe(403);
    expect(
      (
        await techApi.patch(`/api/estimates/${draft.id}`, {
          headers,
          data: body(),
        })
      ).status(),
    ).toBe(403);
    const unassigned = await create({ ...body(), jobId: null });
    expect(
      (await techApi.get(`/api/estimates/${unassigned.id}`)).status(),
    ).toBe(404);
    expect(
      (await techApi.get(`/api/estimates/${unassigned.id}/preview`)).status(),
    ).toBe(404);
    expect(
      (
        await post(api, "/api/estimates/templates", DEFAULT_ESTIMATE_LAYOUT)
      ).status(),
    ).toBe(403);
  });
  test("totals cannot be forged, tax removal requires confirmation and settings gate tax/fees", async () => {
    expect(
      (
        await post(api, "/api/estimates", { ...body(), totalCents: 1 })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(api, "/api/estimates", {
          ...body(),
          lineItems: [{ ...items[0], unitPriceCents: 1.5 }],
        })
      ).status(),
    ).toBe(400);
    await db.organizationSettings.update({
      where: { organizationId: orgId },
      data: {
        taxEnabled: true,
        feeEnabled: true,
        taxRateBasisPoints: 825,
        feeRateBasisPoints: 300,
      },
    });
    const withTax = await create({
      ...body(),
      lineItems: [
        {
          title: "DEMO taxable",
          quantity: "1",
          unitPriceCents: 10000,
          taxable: true,
        },
      ],
      discountCents: 1000,
    });
    expect(withTax.totalCents).toBe(10013);
    const removed = {
      ...body(),
      preferences: {
        includeTax: false,
        includeFee: false,
        removalConfirmed: false,
      },
    };
    const denied = await post(api, "/api/estimates", removed);
    expect(denied.status()).toBe(400);
    expect((await denied.json()).error).toContain(
      "does not determine what is actually owed",
    );
    const excluded = await create({
      ...removed,
      preferences: { ...removed.preferences, removalConfirmed: true },
    });
    expect(excluded.taxCents).toBe(0);
    expect(excluded.feeCents).toBe(0);
    await db.organizationSettings.update({
      where: { organizationId: orgId },
      data: { taxEnabled: false, feeEnabled: false },
    });
  });
  test("number allocation is unique under concurrent creates and rolls back with the document", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => create()),
    );
    const numbers = results.map((r) => r.document.number);
    expect(new Set(numbers).size).toBe(8);
    const counter = await db.sequenceCounter.findFirstOrThrow({
      where: { organizationId: orgId, type: "ESTIMATE" },
    });
    const before = counter.value;
    expect(
      (
        await post(api, "/api/estimates", { ...body(), propertyId: "missing" })
      ).status(),
    ).toBe(404);
    expect(
      (
        await db.sequenceCounter.findUniqueOrThrow({
          where: { id: counter.id },
        })
      ).value,
    ).toBe(before);
    // Fail after allocation/document creation, not merely at input validation.
    const activeTemplate = await db.templateVersion.findFirstOrThrow({
      where: { organizationId: orgId, type: "ESTIMATE", active: true },
    });
    const documentsBefore = await db.document.count({
      where: { organizationId: orgId },
    });
    try {
      await db.templateVersion.update({
        where: { id: activeTemplate.id },
        data: { source: JSON.stringify({ blocks: [] }) },
      });
      expect((await post(api, "/api/estimates", body())).status()).toBe(500);
      expect(
        (
          await db.sequenceCounter.findUniqueOrThrow({
            where: { id: counter.id },
          })
        ).value,
      ).toBe(before);
      expect(
        await db.document.count({ where: { organizationId: orgId } }),
      ).toBe(documentsBefore);
    } finally {
      await db.templateVersion.update({
        where: { id: activeTemplate.id },
        data: { source: activeTemplate.source },
      });
    }
  });
  test("status transitions are validated and expiry is date-bound", async () => {
    const draft = await create();
    expect(
      (
        await post(api, `/api/estimates/${draft.id}/status`, {
          status: "APPROVED",
        })
      ).status(),
    ).toBe(409);
    await post(api, `/api/estimates/${draft.id}/issue`);
    for (const status of ["SENT", "VIEWED", "APPROVED"]) {
      expect(
        (await post(api, `/api/estimates/${draft.id}/status`, { status })).ok(),
      ).toBeTruthy();
    }
    expect(
      (
        await post(api, `/api/estimates/${draft.id}/status`, {
          status: "DRAFT",
        })
      ).status(),
    ).toBe(409);
    const expired = await create({ ...body(), validUntil: "2020-01-01" });
    await post(api, `/api/estimates/${expired.id}/issue`);
    expect(
      (
        await post(api, `/api/estimates/${expired.id}/status`, {
          status: "EXPIRED",
        })
      ).ok(),
    ).toBeTruthy();
  });
  test("600-character details wrap; repeated headers and intact rows survive a forced page break", async () => {
    const layout = structuredClone(DEFAULT_ESTIMATE_LAYOUT);
    const tableIndex = layout.blocks.findIndex(
      (b) => b.type === "lineItemTable",
    );
    // Controlled plain text intentionally positions the table near a page boundary.
    layout.blocks.splice(tableIndex, 0, {
      type: "richText",
      options: {
        field: "assumptions",
        heading: "DEMO pagination fixture",
        copy: Array.from(
          { length: 12 },
          (_, i) => `DEMO pagination context ${i + 1}: accessible areas only.`,
        ).join("\n"),
      },
    });
    expect(
      (await post(adminApi, "/api/estimates/templates", layout)).ok(),
    ).toBeTruthy();
    const description =
      "LONG-SCOPE-START " +
      "Accessible chimney surfaces and agreed preparation only. ".repeat(20);
    const marker = " LONG-SCOPE-END!";
    const detail = description.slice(0, 600 - marker.length) + marker;
    expect(detail.length).toBe(600);
    const draft = await create({
      ...body(),
      lineItems: items.map((l, i) => ({
        ...l,
        description:
          i === 1 ? detail : `ROW-${i}-START DEMO scope ROW-${i}-END`,
      })),
    });
    const issued = await post(api, `/api/estimates/${draft.id}/issue`);
    expect(issued.ok(), await issued.text()).toBeTruthy();
    const link = await (
      await api.get(`/api/estimates/${draft.id}/download`)
    ).json();
    const { text, file } = await pdfText(
      await (await api.get(link.url)).body(),
      "pagination",
    );
    const pages = text.split("\f").filter((p) => p.trim());
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[1]).toContain("Service");
    expect(pages[1]).toContain("Detail / scope");
    expect(text).toContain("$4,425.00");
    for (const [start, end] of [
      ["ROW-0-START", "ROW-0-END"],
      ["LONG-SCOPE-START", "LONG-SCOPE-END!"],
      ["ROW-2-START", "ROW-2-END"],
    ]) {
      const page = pages.find((p) => p.includes(start));
      expect(page, `Missing ${start}`).toBeTruthy();
      expect(page).toContain(end);
    }
    for (const page of pages) {
      expect(page.replace(/\s+/g, " ")).toContain(DISCLAIMERS.estimate);
      expect(page).toMatch(/Page\s+\d+\s+of\s+\d+/);
    }
    execFileSync("pdftoppm", [
      "-f",
      "2",
      "-singlefile",
      "-png",
      "-r",
      "100",
      file,
      "docs/screenshots/phase-b-pagination-page-two",
    ]);
  });
  test("company-defined catalog terms always retain scope and unsafe blocks never render", async () => {
    const service = await db.serviceCatalogItem.create({
      data: {
        organizationId: orgId,
        slug: `demo-level-${stamp}`,
        title: "Level 3 Cleaning",
        category: "DEMO",
        description: "DEMO company cleaning scope",
        scopeSteps: ["DEMO agreed mechanical cleaning areas only."],
        materials: [],
        exclusions: [],
        companyDefinedTerm: true,
      },
    });
    const draft = await create({
      ...body(),
      lineItems: [{ ...items[0], serviceId: service.id, title: "Level 3" }],
    });
    expect(draft.lineItems[0].title).toBe("Level 3 Cleaning");
    const pdf = await api.get(`/api/estimates/${draft.id}/preview`);
    const { text } = await pdfText(await pdf.body(), "company-term");
    const raw = execFileSync(
      "pdftotext",
      ["-raw", path.resolve("private/phase-b-evidence/company-term.pdf"), "-"],
      { encoding: "utf8" },
    ).replace(/\s+/g, "");
    expect(raw).toContain(
      "Company-defined cleaning term; not an NFPA inspection level.".replace(
        /\s+/g,
        "",
      ),
    );
    expect(raw).toContain(
      "DEMO agreed mechanical cleaning areas only.".replace(/\s+/g, ""),
    );
    expect(text).toContain("Level 3 Cleaning");
    const layout = {
      blocks: [
        { type: "script", options: { html: "<script>alert(1)</script>" } },
        ...DEFAULT_ESTIMATE_LAYOUT.blocks,
      ],
    };
    const saved = await post(adminApi, "/api/estimates/templates", layout);
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).source).not.toContain('"type":"script"');
  });
  test("over-height line items are rejected without freezing a split row", async () => {
    const draft = await create({
      ...body(),
      lineItems: [
        { ...items[0], description: "DEMO inaccessible scope. ".repeat(700) },
      ],
    });
    const r = await post(api, `/api/estimates/${draft.id}/issue`);
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toContain("one printable page");
    const version = await db.documentVersion.findFirstOrThrow({
      where: { documentId: draft.documentId },
    });
    expect(version.issuedAt).toBeNull();
    expect(version.pdfFileId).toBeNull();
  });
});
