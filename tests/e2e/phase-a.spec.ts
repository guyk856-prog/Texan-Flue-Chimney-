import "dotenv/config";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const db = new PrismaClient();
const origin = process.env.AUTH_URL ?? "http://localhost:3000";
const password = process.env.SEED_DEMO_PASSWORD!;
const suffix = Date.now().toString();
let customerId = "",
  propertyId = "",
  jobId = "",
  secondOrg = "",
  foreignJob = "",
  fileId = "";
async function login(page: Page, role: string) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`demo.${role}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
async function post(request: APIRequestContext, url: string, data: unknown) {
  return request.post(url, { headers: { origin }, data });
}
test.describe.serial("Phase A real PostgreSQL workflow", () => {
  test.afterAll(async () => {
    await db.$disconnect();
  });
  test("OFFICE creates a customer, property and job through the UI", async ({
    page,
  }) => {
    await login(page, "office");
    await page.getByRole("link", { name: "New customer", exact: true }).click();
    await page.getByLabel("Customer name").fill(`DEMO acceptance ${suffix}`);
    await page.getByLabel("Phone", { exact: true }).fill("469-555-0100");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`demo-${suffix}@example.test`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).not.toHaveURL(/\/new(?:\?|$)/);
    await expect(page).toHaveURL(/customers\/[^/]+$/);
    customerId = page.url().split("/").pop()!;
    await page.getByRole("link", { name: "Add property", exact: true }).click();
    await page.getByLabel("Street address").fill(`DEMO 10 Test Lane ${suffix}`);
    await page.getByLabel(/^City/).fill("Dallas");
    await page.getByLabel("Postal code").fill("75204");
    await page.getByLabel("Gate code").fill("DEMO-1234");
    await page.getByLabel("Access notes").fill("DEMO call before arrival");
    await page
      .getByLabel("Chimney details")
      .fill("DEMO wood-burning fireplace");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).not.toHaveURL(/\/new(?:\?|$)/);
    await expect(page).toHaveURL(/properties\/[^/]+$/);
    propertyId = page.url().split("/").pop()!;
    await page.getByRole("link", { name: "Open job", exact: true }).click();
    await page.getByLabel("Job title").fill(`DEMO sweep ${suffix}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).not.toHaveURL(/\/new(?:\?|$)/);
    await expect(page).toHaveURL(/jobs\/[^/]+$/);
    jobId = page.url().split("/").pop()!;
    await expect(
      page.getByRole("heading", { name: `DEMO sweep ${suffix}` }),
    ).toBeVisible();
    const record = await db.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { property: true },
    });
    expect(record.customerId).toBe(customerId);
    expect(record.property.gateCode).toBe("DEMO-1234");
  });
  test("OFFICE search, edits, status rules, appointments and deletion policy", async ({
    page,
  }) => {
    await login(page, "office");
    const api = page.request;
    for (const q of [
      suffix,
      "469-555-0100",
      `demo-${suffix}@example.test`,
      `Test Lane ${suffix}`,
    ]) {
      const r = await api.get(`/api/data/customers?q=${encodeURIComponent(q)}`);
      expect(r.ok()).toBeTruthy();
      expect(
        (await r.json()).some((r: { id: string }) => r.id === customerId),
      ).toBeTruthy();
    }
    expect(
      (
        await post(api, `/api/data/jobs/${jobId}/status`, {
          status: "COMPLETED",
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await post(api, `/api/data/jobs/${jobId}/status`, {
          status: "SCHEDULED",
        })
      ).ok(),
    ).toBeTruthy();
    const ap = await post(api, `/api/data/jobs/${jobId}/appointments`, {
      startsAt: "2026-10-27T14:00:00Z",
      endsAt: "2026-10-27T15:00:00Z",
      note: "DEMO visit",
    });
    expect(ap.ok()).toBeTruthy();
    expect(
      (
        await post(api, `/api/data/jobs/${jobId}/appointments`, {
          startsAt: "2026-10-27T16:00:00Z",
          endsAt: "2026-10-27T15:00:00Z",
        })
      ).status(),
    ).toBe(400);
    const edit = await api.patch(`/api/data/customers/${customerId}`, {
      headers: { origin },
      data: {
        name: `DEMO edited ${suffix}`,
        phone: "469-555-0100",
        tags: ["DEMO"],
      },
    });
    expect(edit.ok()).toBeTruthy();
    expect(
      (
        await api.delete(`/api/data/customers/${customerId}`, {
          headers: { origin },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api.patch(`/api/data/jobs/${jobId}`, {
          headers: { origin },
          data: {
            customerId,
            propertyId,
            title: "DEMO",
            organizationId: "evil",
          },
        })
      ).status(),
    ).toBe(400);
    const counts = await (await api.get("/api/data/dashboard")).json();
    expect(counts.customerCount).toBe(
      await db.customer.count({
        where: { organizationId: "texan-flue", deletedAt: null },
      }),
    );
    expect(
      (
        await api.post("/api/data/customers", {
          headers: { origin: "https://evil.example" },
          data: { name: "DEMO" },
        })
      ).status(),
    ).toBe(403);
  });
  test("TECHNICIAN receives 404 on unassigned jobs and cannot access admin routes", async ({
    page,
  }) => {
    await login(page, "technician");
    expect((await page.request.get(`/api/data/jobs/${jobId}`)).status()).toBe(
      404,
    );
    expect((await page.goto(`/jobs/${jobId}`))?.status()).toBe(404);
    expect(
      (await page.request.get(`/api/data/customers/${customerId}`)).status(),
    ).toBe(404);
    expect(
      (await page.request.get(`/api/data/properties/${propertyId}`)).status(),
    ).toBe(404);
    for (const route of [
      "/settings/company",
      "/settings/users",
      "/settings/templates",
      "/settings/ai",
    ]) {
      expect((await page.goto(route))?.status()).toBe(403);
    }
    expect(
      (await page.request.get("/api/data/settings/company")).status(),
    ).toBe(403);
    expect(
      (
        await post(page.request, "/api/data/customers", {
          name: "DEMO unauthorized",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(page.request, `/api/data/jobs/${jobId}/status`, {
          status: "CANCELLED",
        })
      ).status(),
    ).toBe(403);
  });
  test("assignment grants scoped reads and removal revokes them", async ({
    page,
    browser,
  }) => {
    await login(page, "office");
    const tech = await db.user.findUniqueOrThrow({
      where: { email: "demo.technician@example.test" },
    });
    expect(
      (
        await post(page.request, `/api/data/jobs/${jobId}/assignments`, {
          userId: tech.id,
        })
      ).ok(),
    ).toBeTruthy();
    const ctx = await browser.newContext();
    const tp = await ctx.newPage();
    await login(tp, "technician");
    expect((await tp.request.get(`/api/data/jobs/${jobId}`)).ok()).toBeTruthy();
    expect(
      (await tp.request.get(`/api/data/customers/${customerId}`)).ok(),
    ).toBeTruthy();
    expect(
      (await tp.request.get(`/api/data/properties/${propertyId}`)).ok(),
    ).toBeTruthy();
    const deleteAssignment = await page.request.delete(
      `/api/data/jobs/${jobId}/assignments/${tech.id}`,
      { headers: { origin } },
    );
    expect(deleteAssignment.ok()).toBeTruthy();
    expect((await tp.request.get(`/api/data/jobs/${jobId}`)).status()).toBe(
      404,
    );
    await ctx.close();
  });
  test("tenant boundary and property ownership are enforced", async ({
    page,
  }) => {
    secondOrg = `demo-foreign-${suffix}`;
    const org = await db.organization.create({
      data: {
        id: secondOrg,
        name: "DEMO foreign",
        brandName: "DEMO",
        phone: "",
        email: "",
        website: "",
        addrLine1: "DEMO",
        city: "DEMO",
        state: "TX",
        postal: "00000",
      },
    });
    const c = await db.customer.create({
      data: { organizationId: org.id, name: "DEMO foreign", tags: ["DEMO"] },
    });
    const p = await db.property.create({
      data: {
        customerId: c.id,
        line1: "DEMO",
        city: "DEMO",
        state: "TX",
        postal: "00000",
      },
    });
    const j = await db.job.create({
      data: {
        organizationId: org.id,
        customerId: c.id,
        propertyId: p.id,
        title: "DEMO foreign",
        number: `DEMO-FOREIGN-${suffix}`,
      },
    });
    foreignJob = j.id;
    await login(page, "office");
    expect(
      (await page.request.get(`/api/data/jobs/${foreignJob}`)).status(),
    ).toBe(404);
    expect(
      (
        await post(page.request, "/api/data/jobs", {
          customerId,
          propertyId: p.id,
          title: "DEMO cross tenant",
        })
      ).status(),
    ).toBe(404);
    const c2 = await post(page.request, "/api/data/customers", {
      name: `DEMO second ${suffix}`,
      tags: ["DEMO"],
    });
    const secondId = (await c2.json()).id;
    expect(
      (
        await post(page.request, "/api/data/jobs", {
          customerId: secondId,
          propertyId,
          title: "DEMO wrong customer",
        })
      ).status(),
    ).toBe(400);
  });
  test("private files reject bad uploads and require a signed session-bound URL", async ({
    page,
    browser,
  }) => {
    await login(page, "office");
    const headers = { origin };
    const tooBig = await page.request.post("/api/files", {
      headers,
      multipart: {
        file: {
          name: "demo.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
        },
      },
    });
    expect(tooBig.status()).toBe(413);
    expect((await tooBig.json()).error).toContain("10 MiB");
    for (const file of [
      {
        name: "demo.html",
        mimeType: "text/html",
        buffer: Buffer.from("<html>bad</html>"),
      },
      {
        name: "demo.png",
        mimeType: "image/png",
        buffer: Buffer.from("<script>bad</script>"),
      },
    ]) {
      expect(
        (
          await page.request.post("/api/files", {
            headers,
            multipart: { file },
          })
        ).status(),
      ).toBe(400);
    }
    const bytes = Buffer.from("%PDF-1.4\nDEMO private upload\n%%EOF");
    const upload = await page.request.post("/api/files", {
      headers,
      multipart: {
        file: { name: "demo.pdf", mimeType: "application/pdf", buffer: bytes },
        jobId,
      },
    });
    expect(upload.status()).toBe(201);
    fileId = (await upload.json()).id;
    const link = await (
      await page.request.get(`/api/data/files/${fileId}/link`)
    ).json();
    const result = await page.request.get(link.url);
    expect(result.ok()).toBeTruthy();
    expect(await result.body()).toEqual(bytes);
    expect(result.headers()["content-disposition"]).toContain("attachment");
    expect((await page.request.get(`/api/files/${fileId}`)).status()).toBe(404);
    const badUrl = new URL(link.url, origin);
    badUrl.searchParams.set("expires", "1");
    expect((await page.request.get(badUrl.toString())).status()).toBe(404);
    const ctx = await browser.newContext();
    expect((await ctx.request.get(link.url)).status()).toBe(401);
    const tp = await ctx.newPage();
    await login(tp, "technician");
    expect((await tp.request.get(link.url)).status()).toBe(404);
    expect(
      (await tp.request.get(`/api/data/files/${fileId}/link`)).status(),
    ).toBe(404);
    await ctx.close();
  });
  test("ADMIN catalog versions, company terms and soft deletion", async ({
    page,
  }) => {
    await login(page, "admin");
    const api = page.request;
    const entries = await (await api.get("/api/data/services")).json();
    expect(
      entries.filter((s: { slug: string }) => !s.slug.startsWith("demo-test-"))
        .length,
    ).toBe(19);
    expect(
      entries.map((s: { title: string }) => s.title).join(" "),
    ).not.toMatch(/gas valve|gas log/i);
    const service = {
      slug: `demo-test-${suffix}`,
      title: "DEMO test service",
      category: "DEMO",
      description: "DEMO explicit scope",
      scopeSteps: ["DEMO clean agreed accessible surfaces"],
      materials: [],
      exclusions: [],
      unit: "each",
      active: true,
      companyDefinedTerm: true,
      unitPriceCents: 12345,
    };
    expect(
      (
        await post(api, "/api/data/services", { ...service, scopeSteps: [] })
      ).status(),
    ).toBe(400);
    const created = await post(api, "/api/data/services", service);
    expect(created.ok()).toBeTruthy();
    const id = (await created.json()).id;
    expect(
      (
        await api.patch(`/api/data/services/${id}`, {
          headers: { origin },
          data: { ...service, unitPriceCents: 15000 },
        })
      ).ok(),
    ).toBeTruthy();
    const prices = await db.servicePriceVersion.findMany({
      where: { serviceId: id },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(prices.map((p) => p.unitPriceCents)).toEqual([12345, 15000]);
    expect(prices[0].effectiveTo).not.toBeNull();
    expect(prices[1].effectiveTo).toBeNull();
    expect(
      (
        await api.delete(`/api/data/customers/${customerId}`, {
          headers: { origin },
        })
      ).ok(),
    ).toBeTruthy();
    expect((await api.get(`/api/data/customers/${customerId}`)).status()).toBe(
      404,
    );
    expect((await api.get(`/api/data/properties/${propertyId}`)).status()).toBe(
      404,
    );
    expect((await api.get(`/api/data/jobs/${jobId}`)).status()).toBe(404);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: customerId } }))
        .deletedAt,
    ).not.toBeNull();
    const settings = await db.organizationSettings.findUniqueOrThrow({
      where: { organizationId: "texan-flue" },
    });
    expect(settings.taxEnabled).toBe(false);
    expect(settings.feeEnabled).toBe(false);
  });
  test("password reset is single-use, delivered privately, revokes sessions and allows new login", async ({
    page,
  }) => {
    const email = `demo.reset.${suffix}@example.test`;
    const resetUser = await db.user.create({
      data: {
        organizationId: "texan-flue",
        email,
        name: "DEMO reset acceptance",
        role: "OFFICE",
        passwordHash: await hash(password, 12),
      },
    });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    expect(
      (await post(page.request, "/api/password/request", { email })).ok(),
    ).toBeTruthy();
    const dir = path.resolve(process.env.MAIL_CAPTURE_DIR ?? "./private/mail");
    const names = await readdir(dir);
    let token = "";
    for (const n of names) {
      const m = JSON.parse(await readFile(path.join(dir, n), "utf8"));
      if (m.to === email) {
        token = new URL(m.text.split(": ").pop()).searchParams.get("token")!;
      }
    }
    expect(token).toBeTruthy();
    const stored = await db.passwordResetToken.findFirstOrThrow({
      where: { userId: resetUser.id },
    });
    expect(stored.tokenHash).not.toBe(token);
    const changed = password + "new";
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel("Password", { exact: true }).fill(changed);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toContainText("Password updated");
    expect((await page.request.get("/api/data/dashboard")).status()).toBe(401);
    expect(
      (
        await post(page.request, "/api/password/reset", {
          token,
          password: changed,
        })
      ).status(),
    ).toBe(400);
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(changed);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/login/);
    expect((await page.request.get("/api/data/dashboard")).status()).toBe(401);
    expect(await db.session.count({ where: { userId: resetUser.id } })).toBe(0);
  });
});
