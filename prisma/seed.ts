import { SERVICE_LIBRARY as entries } from "../src/lib/service-library";
import { storeBytes, readStored } from "../src/lib/storage";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { layoutFor } from "../src/lib/document-layouts";
import { CHIMNEY_CHECKLIST, DRYER_CHECKLIST } from "../src/lib/checklists";
import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
if (process.env.NODE_ENV === "production" || process.env.VERCEL)
  throw new Error(
    "Demo seed is disabled in production. Use the secure first-run setup.",
  );
const db = new PrismaClient();

async function main() {
  const password = z
    .string()
    .min(16)
    .max(72)
    .refine((s) => Buffer.byteLength(s, "utf8") <= 72)
    .parse(process.env.SEED_DEMO_PASSWORD);
  const passwordHash = await hash(password, 12);
  const org = await db.organization.upsert({
    where: { id: "texan-flue" },
    update: {},
    create: {
      id: "texan-flue",
      name: "Texan Flue Chimney Service",
      brandName: "Texan Flue Chimney",
      phone: "469-771-7000",
      email: "",
      website: "https://texanflue.com",
      addrLine1: "2781 N Carroll Ave",
      city: "Dallas",
      state: "TX",
      postal: "75204",
    },
  });
  await db.organizationSettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      taxEnabled: false,
      feeEnabled: false,
      aiEnabled: false,
      defaultTerms: "DEMO configuration - review before live use.",
    },
  });
  for (const role of Object.values(UserRole)) {
    const email = `demo.${role.toLowerCase()}@example.test`;
    await db.user.upsert({
      where: { email },
      update: {},
      create: {
        organizationId: org.id,
        email,
        name: `DEMO ${role}`,
        role,
        passwordHash,
      },
    });
  }
  if (!org.logoId) {
    const bytes = await readFile(path.resolve("public/brand/logo-mark.webp"));
    const storageKey = "texan-brand-mark-v1";
    try {
      await readStored(storageKey);
    } catch {
      await storeBytes(storageKey, bytes, "image/webp");
    }
    const admin = await db.user.findUniqueOrThrow({
      where: { email: "demo.admin@example.test" },
    });
    const asset = await db.fileAsset.upsert({
      where: { storageKey },
      update: {},
      create: {
        storageKey,
        filename: "logo-mark.webp",
        mimeType: "image/webp",
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        uploadedById: admin.id,
      },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { logoId: asset.id },
    });
  }
  for (const [index, [title, category, scopeSteps]] of entries.entries()) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, "");
    await db.serviceCatalogItem.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug } },
      update: {},
      create: {
        organizationId: org.id,
        slug,
        title,
        category,
        description: `DEMO starter wording - review and edit before use. ${scopeSteps.join(" ")}`,
        scopeSteps,
        materials: [],
        exclusions: [
          "DEMO scope: additional work requires separate agreement.",
        ],
        companyDefinedTerm: title === "Level 3 Cleaning",
        sortOrder: index,
      },
    });
  }
  for (const type of [
    "INVOICE",
    "RECEIPT",
    "INSPECTION",
    "DRYER_VENT_REPORT",
    "APPROVAL_CERTIFICATE",
  ] as const) {
    if (
      !(await db.templateVersion.findFirst({
        where: { organizationId: org.id, type },
      }))
    )
      await db.templateVersion.create({
        data: {
          organizationId: org.id,
          type,
          version: 1,
          active: true,
          source: JSON.stringify({
            ...layoutFor(type),
            ...(type === "INSPECTION" || type === "DRYER_VENT_REPORT"
              ? {
                  checklist:
                    type === "INSPECTION" ? CHIMNEY_CHECKLIST : DRYER_CHECKLIST,
                }
              : {}),
          }),
        },
      });
  }
  console.log(
    "Seed complete: organization, DEMO settings, 3 DEMO users and 19 DEMO catalog entries. No prices fabricated. Existing records unchanged.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
