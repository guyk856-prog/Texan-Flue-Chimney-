import "dotenv/config";
import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
test("Scenario H: without a provider key AI is absent even when the organization enables it; manual estimates still work", async ({
  page,
}) => {
  const stamp = Date.now().toString();
  const org = await db.organization.create({
    data: {
      name: "DEMO ONLY No-key organization",
      brandName: "DEMO ONLY",
      phone: "",
      email: "",
      website: "",
      addrLine1: "DEMO",
      city: "Dallas",
      state: "TX",
      postal: "75204",
      settings: { create: { aiEnabled: true, aiProvider: "ANTHROPIC" } },
    },
  });
  const password = process.env.SEED_DEMO_PASSWORD!;
  const email = `demo.nokey.${stamp}@example.test`;
  await db.user.create({
    data: {
      organizationId: org.id,
      name: "DEMO ONLY No-key office",
      email,
      role: "OFFICE",
      passwordHash: await hash(password, 12),
    },
  });
  const c = await db.customer.create({
    data: { organizationId: org.id, name: "DEMO ONLY Manual Customer" },
  });
  const p = await db.property.create({
    data: {
      customerId: c.id,
      line1: "DEMO ONLY Manual Property",
      city: "Dallas",
      state: "TX",
      postal: "75204",
    },
  });
  await db.serviceCatalogItem.create({
    data: {
      organizationId: org.id,
      slug: "demo-manual",
      title: "DEMO ONLY Manual Sweep",
      category: "DEMO",
      description: "DEMO manually selected scope",
      scopeSteps: ["DEMO scope review"],
      unit: "each",
    },
  });
  const api = await request.newContext({ baseURL: process.env.AUTH_URL });
  try {
    const csrf = await (await api.get("/api/auth/csrf")).json();
    await api.post("/api/auth/callback/credentials", {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: {
        csrfToken: csrf.csrfToken,
        email,
        password,
        callbackUrl: process.env.AUTH_URL + "/dashboard",
      },
    });
    const availability = await (await api.get("/api/ai/availability")).json();
    expect(availability.available).toBe(false);
    await page.context().addCookies((await api.storageState()).cookies);
    await page.goto("/estimates");
    await expect(page.getByRole("link", { name: "Build with AI" })).toHaveCount(
      0,
    );
    await page.goto("/estimates/new");
    await expect(
      page.getByRole("button", { name: "Write with AI", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Customer", exact: true })
      .selectOption(c.id);
    await page
      .getByRole("combobox", { name: "Property", exact: true })
      .selectOption(p.id);
    await page
      .getByRole("combobox", { name: "Service library", exact: true })
      .selectOption({ label: "DEMO ONLY Manual Sweep — enter price" });
    await page.getByLabel("Unit price (integer cents)").fill("9900");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(/\/estimates\/c/);
    await expect(page.locator("body")).toContainText("DRAFT");
    const r = await api.post("/api/ai/write", {
      headers: { origin: process.env.AUTH_URL! },
      data: {
        action: "Improve",
        text: "scope",
        notes: "",
        serviceId: null,
        resource: null,
      },
    });
    expect(r.status()).toBe(404);
    await page.goto("/estimates/ai");
    expect(
      await page.getByRole("heading", { name: "AI estimate review" }).count(),
    ).toBe(0);
  } finally {
    await api.dispose();
    await db.$disconnect();
  }
});
