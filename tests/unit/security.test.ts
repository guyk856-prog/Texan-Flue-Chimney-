import { describe, it, expect, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import {
  customerInput,
  propertyInput,
  appointmentInput,
  serviceInput,
  transitions,
} from "@/lib/validation";
import { validateFile, MAX_FILE_SIZE } from "@/lib/files";
import {
  admin,
  office,
  jobScope,
  customerScope,
  propertyScope,
  type Actor,
} from "@/lib/access";
import { hashToken, newToken, limit } from "@/lib/security";
import { sameOrigin } from "@/lib/errors";
const tech: Actor = {
  id: "tech",
  organizationId: "org-a",
  role: "TECHNICIAN",
  name: "DEMO tech",
};
describe("server policy", () => {
  it("scopes technicians by organization, active parents and assignment", () => {
    expect(jobScope(tech)).toEqual({
      organizationId: "org-a",
      deletedAt: null,
      customer: { deletedAt: null },
      property: { deletedAt: null },
      assignments: { some: { userId: "tech" } },
    });
    expect(customerScope(tech)).toMatchObject({
      organizationId: "org-a",
      jobs: { some: { assignments: { some: { userId: "tech" } } } },
    });
    expect(propertyScope(tech)).toMatchObject({
      customer: { organizationId: "org-a" },
      jobs: { some: { assignments: { some: { userId: "tech" } } } },
    });
  });
  it("rejects technician office actions and non-admin settings", () => {
    expect(() => office(tech)).toThrow("Office access required");
    expect(() => admin({ ...tech, role: "OFFICE" })).toThrow(
      "Administrator access required",
    );
    expect(() => admin({ ...tech, role: "ADMIN" })).not.toThrow();
  });
  it("rejects cross-origin and absent-origin mutations", () => {
    process.env.AUTH_URL = "http://localhost:3000";
    expect(() =>
      sameOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() => sameOrigin(new Request("http://localhost:3000"))).toThrow();
  });
  it("limits repeated attempts", () => {
    const key = newToken();
    limit(key, 1);
    expect(() => limit(key, 1)).toThrow("Too many attempts");
  });
  it("generates high-entropy tokens and stable non-plaintext hashes", () => {
    const a = newToken(),
      b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toMatch(/^[a-f0-9]{64}$/);
  });
});
describe("boundaries", () => {
  it("rejects mass assignment and invalid customer contact", () => {
    expect(
      customerInput.safeParse({ name: "Demo", organizationId: "foreign" })
        .success,
    ).toBe(false);
    expect(
      customerInput.safeParse({ name: "Demo", email: "not-an-email" }).success,
    ).toBe(false);
  });
  it("retains access and chimney fields", () => {
    expect(
      propertyInput.parse({
        customerId: "demo",
        line1: "DEMO",
        city: "Dallas",
        state: "TX",
        postal: "75204",
        gateCode: "123",
        accessNotes: "Call first",
        chimneyNotes: "Wood",
        storeys: 2,
      }),
    ).toMatchObject({ gateCode: "123", storeys: 2 });
  });
  it("requires appointments to end after they start", () => {
    expect(
      appointmentInput.safeParse({
        startsAt: "2026-10-26T12:00:00Z",
        endsAt: "2026-10-26T11:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("enforces integer cents and explicit company term scope", () => {
    const input = {
      slug: "demo",
      title: "DEMO",
      category: "Cleaning",
      description: "DEMO",
      scopeSteps: [],
      companyDefinedTerm: true,
      unitPriceCents: 100,
    };
    expect(serviceInput.safeParse(input).success).toBe(false);
    expect(
      serviceInput.safeParse({
        ...input,
        scopeSteps: ["Explicit scope"],
        unitPriceCents: 1.5,
      }).success,
    ).toBe(false);
    expect(
      serviceInput.safeParse({ ...input, scopeSteps: ["Explicit scope"] })
        .success,
    ).toBe(true);
  });
  it("has terminal job statuses and no direct lead-to-completed transition", () => {
    expect(transitions.COMPLETED).toEqual([]);
    expect(transitions.CANCELLED).toEqual([]);
    expect(transitions.LEAD).not.toContain("COMPLETED");
  });
});
describe("private upload validation", () => {
  it("rejects oversize even if MIME and extension are allowed", () => {
    expect(() =>
      validateFile("demo.pdf", "application/pdf", MAX_FILE_SIZE + 1),
    ).toThrow("10 MiB");
  });
  it("rejects extension, MIME and content mismatches", () => {
    expect(() => validateFile("demo.html", "text/html", 10)).toThrow();
    expect(() => validateFile("demo.png", "text/html", 10)).toThrow();
    expect(() =>
      validateFile("demo.png", "image/png", 10, Buffer.from("<script>")),
    ).toThrow();
  });
  it("accepts matching signatures and rejects empty files", () => {
    const pdf = Buffer.from("%PDF-1.7\n");
    expect(() =>
      validateFile("demo.pdf", "application/pdf", pdf.length, pdf),
    ).not.toThrow();
    expect(() => validateFile("demo.pdf", "application/pdf", 0)).toThrow(
      "empty",
    );
  });
});
