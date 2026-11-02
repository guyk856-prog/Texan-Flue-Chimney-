import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "./db";
import { hashToken, limit } from "./security";
import { HttpError } from "./errors";
import { SERVICE_LIBRARY } from "./service-library";
export async function bootstrap(raw: unknown) {
  const v = z
    .object({
      token: z.string().min(16).max(200),
      email: z.email().max(254),
      password: z
        .string()
        .min(16)
        .max(72)
        .refine((s) => Buffer.byteLength(s) <= 72),
      name: z.string().trim().min(1).max(150),
    })
    .strict()
    .parse(raw);
  await limit("bootstrap", 8);
  if (
    !process.env.BOOTSTRAP_TOKEN ||
    !timingSafeEqual(
      Buffer.from(hashToken(v.token)),
      Buffer.from(hashToken(process.env.BOOTSTRAP_TOKEN)),
    )
  )
    throw new HttpError(
      403,
      "The setup code is invalid. Check the deployment’s BOOTSTRAP_TOKEN setting.",
    );
  const passwordHash = await hash(v.password, 12);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(875612340)`;
      if (await tx.user.count())
        throw new HttpError(
          409,
          "An owner already exists. Sign in or use password reset.",
        );
      const org = await tx.organization.create({
        data: {
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
          settings: {
            create: { taxEnabled: false, feeEnabled: false, aiEnabled: false },
          },
        },
      });
      await tx.user.create({
        data: {
          organizationId: org.id,
          email: v.email.toLowerCase(),
          name: v.name,
          role: "ADMIN",
          passwordHash,
        },
      });
      for (const [
        index,
        [title, category, scopeSteps],
      ] of SERVICE_LIBRARY.entries())
        await tx.serviceCatalogItem.create({
          data: {
            organizationId: org.id,
            title,
            slug: title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/-$/, ""),
            category,
            description: scopeSteps.join(" "),
            scopeSteps,
            materials: [],
            exclusions: [
              "Work outside the agreed scope requires a separate agreement.",
            ],
            unit: "each",
            companyDefinedTerm: title === "Level 3 Cleaning",
            sortOrder: index,
          },
        });
      return { created: true, email: v.email.toLowerCase() };
    },
    { timeout: 30000 },
  );
}
