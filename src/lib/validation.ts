import { z } from "zod";
import { ApplianceType, JobStatus } from "@prisma/client";
const text = z.string().trim().max(10000);
const short = z.string().trim().max(250);
const optional = short.optional();
export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const customerInput = z
  .object({
    name: short.min(1),
    companyName: optional,
    phone: optional,
    email: z.union([z.email().max(254), z.literal("")]).optional(),
    billLine1: optional,
    billLine2: optional,
    billCity: optional,
    billState: optional,
    billPostal: optional,
    preferredLang: short.default("en"),
    notes: text.optional(),
    tags: z.array(short.min(1)).max(30).default([]),
  })
  .strict();
export const propertyInput = z
  .object({
    customerId: idSchema,
    label: optional,
    line1: short.min(1),
    line2: optional,
    city: short.min(1),
    state: short.min(1),
    postal: short.min(1),
    accessNotes: text.optional(),
    gateCode: optional,
    chimneyNotes: text.optional(),
    applianceType: z.enum(ApplianceType).nullable().optional(),
    storeys: z.number().int().min(1).max(100).nullable().optional(),
    roofType: optional,
  })
  .strict();
export const jobInput = z
  .object({
    customerId: idSchema,
    propertyId: idSchema,
    title: short.min(1),
    scope: text.optional(),
    accessNotes: text.optional(),
    safetyNotes: text.optional(),
    internalNotes: text.optional(),
  })
  .strict();
export const statusInput = z.object({ status: z.enum(JobStatus) }).strict();
export const assignmentInput = z.object({ userId: idSchema }).strict();
export const appointmentInput = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    note: text.optional(),
  })
  .strict()
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "End must be after start.",
  });
export const serviceInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(150),
    title: short.min(1),
    category: short.min(1),
    description: text.min(1),
    scopeSteps: z.array(short.min(1)).max(50),
    materials: z.array(short).max(50).default([]),
    exclusions: z.array(short).max(50).default([]),
    unit: short.min(1).default("each"),
    active: z.boolean().default(true),
    companyDefinedTerm: z.boolean().default(false),
    unitPriceCents: z.number().int().min(0).max(2147483647).optional(),
  })
  .strict()
  .refine((v) => !v.companyDefinedTerm || v.scopeSteps.length > 0, {
    message: "Company-defined terms require explicit scope steps.",
  });
export const transitions: Record<JobStatus, readonly JobStatus[]> = {
  LEAD: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
