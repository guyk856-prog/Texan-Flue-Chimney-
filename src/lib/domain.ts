import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  type Actor,
  office,
  admin,
  customerScope,
  propertyScope,
  jobScope,
  visibleJob,
} from "./access";
import { HttpError } from "./errors";
import {
  customerInput,
  propertyInput,
  jobInput,
  statusInput,
  assignmentInput,
  appointmentInput,
  serviceInput,
  transitions,
  idSchema,
} from "./validation";
import { z } from "zod";
const search = z.string().trim().max(200);
type Tx = Prisma.TransactionClient;
async function audit(
  tx: Tx,
  a: Actor,
  entity: string,
  entityId: string,
  action: string,
) {
  await tx.auditLog.create({
    data: {
      organizationId: a.organizationId,
      userId: a.id,
      entity,
      entityId,
      action,
    },
  });
}
export async function customers(a: Actor, query = "") {
  const q = search.parse(query);
  const matches: Prisma.CustomerWhereInput[] = [
    "name",
    "companyName",
    "phone",
    "email",
    "billLine1",
    "billCity",
    "billPostal",
  ].map((field) => ({ [field]: { contains: q, mode: "insensitive" } }));
  return db.customer.findMany({
    where: {
      AND: [
        customerScope(a),
        {
          OR: matches.concat([
            {
              properties: {
                some: {
                  AND: [
                    propertyScope(a),
                    {
                      OR: ["line1", "city", "postal"].map((field) => ({
                        [field]: { contains: q, mode: "insensitive" },
                      })),
                    },
                  ],
                },
              },
            },
          ]),
        },
      ],
    },
    orderBy: { name: "asc" },
    take: 200,
  });
}
export async function customer(a: Actor, id: string) {
  idSchema.parse(id);
  const row = await db.customer.findFirst({
    where: { AND: [customerScope(a), { id }] },
    include: {
      properties: { where: propertyScope(a), orderBy: { createdAt: "asc" } },
      jobs: { where: jobScope(a), orderBy: { createdAt: "desc" } },
    },
  });
  if (!row) throw new HttpError(404, "Customer not found.");
  return row;
}
export async function saveCustomer(a: Actor, raw: unknown, id?: string) {
  office(a);
  const data = customerInput.parse(raw);
  if (id) await customer(a, id);
  return db.$transaction(async (tx) => {
    const row = id
      ? await tx.customer.update({ where: { id }, data })
      : await tx.customer.create({
          data: { ...data, organizationId: a.organizationId },
        });
    await audit(tx, a, "Customer", row.id, id ? "UPDATE" : "CREATE");
    return row;
  });
}
export async function properties(a: Actor, query = "") {
  const q = search.parse(query);
  return db.property.findMany({
    where: {
      AND: [
        propertyScope(a),
        {
          OR: ["line1", "line2", "city", "postal", "label"].map((field) => ({
            [field]: { contains: q, mode: "insensitive" },
          })),
        },
      ],
    },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
export async function property(a: Actor, id: string) {
  idSchema.parse(id);
  const row = await db.property.findFirst({
    where: { AND: [propertyScope(a), { id }] },
    include: { customer: true, jobs: { where: jobScope(a) } },
  });
  if (!row) throw new HttpError(404, "Property not found.");
  return row;
}
export async function saveProperty(a: Actor, raw: unknown, id?: string) {
  office(a);
  const data = propertyInput.parse(raw);
  await customer(a, data.customerId);
  if (id) {
    const old = await property(a, id);
    if (old.customerId !== data.customerId)
      throw new HttpError(
        400,
        "A property cannot be moved to another customer.",
      );
  }
  return db.$transaction(async (tx) => {
    const row = id
      ? await tx.property.update({ where: { id }, data })
      : await tx.property.create({ data });
    await audit(tx, a, "Property", row.id, id ? "UPDATE" : "CREATE");
    return row;
  });
}
export async function jobs(a: Actor, query = "") {
  const q = search.parse(query);
  return db.job.findMany({
    where: {
      AND: [
        jobScope(a),
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { number: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { property: { line1: { contains: q, mode: "insensitive" } } },
          ],
        },
      ],
    },
    include: {
      customer: { select: { name: true } },
      property: { select: { line1: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
export async function saveJob(a: Actor, raw: unknown, id?: string) {
  office(a);
  const data = jobInput.parse(raw);
  await customer(a, data.customerId);
  const prop = await property(a, data.propertyId);
  if (prop.customerId !== data.customerId)
    throw new HttpError(400, "Property must belong to this customer.");
  if (id) {
    const old = await visibleJob(a, id);
    if (
      old.customerId !== data.customerId ||
      old.propertyId !== data.propertyId
    )
      throw new HttpError(400, "Job customer and property cannot be changed.");
  }
  return db.$transaction(async (tx) => {
    let row;
    if (id) row = await tx.job.update({ where: { id }, data });
    else {
      // Dedicated PostgreSQL sequence avoids count-based and concurrent duplicates.
      const [{ value }] = await tx.$queryRaw<
        { value: bigint }[]
      >`SELECT nextval('job_number_seq') AS value`;
      row = await tx.job.create({
        data: {
          ...data,
          organizationId: a.organizationId,
          number: `TF-JOB-${String(value).padStart(6, "0")}`,
        },
      });
    }
    await audit(tx, a, "Job", row.id, id ? "UPDATE" : "CREATE");
    return row;
  });
}
export async function setStatus(a: Actor, id: string, raw: unknown) {
  office(a);
  await visibleJob(a, id);
  const { status } = statusInput.parse(raw);
  return db.$transaction(async (tx) => {
    const current = await tx.job.findUniqueOrThrow({ where: { id } });
    if (!transitions[current.status].includes(status))
      throw new HttpError(409, `Cannot change ${current.status} to ${status}.`);
    const result = await tx.job.updateMany({
      where: { id, status: current.status, deletedAt: null },
      data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
    });
    if (result.count !== 1)
      throw new HttpError(409, "Job changed. Refresh and retry.");
    await audit(tx, a, "Job", id, `STATUS_${status}`);
    return { status };
  });
}
export async function assign(
  a: Actor,
  id: string,
  raw: unknown,
  remove = false,
) {
  office(a);
  await visibleJob(a, id);
  const { userId } = assignmentInput.parse(raw);
  const tech = await db.user.findFirst({
    where: {
      id: userId,
      organizationId: a.organizationId,
      role: "TECHNICIAN",
      active: true,
      deletedAt: null,
    },
  });
  if (!tech) throw new HttpError(404, "Technician not found.");
  return db.$transaction(async (tx) => {
    const row = remove
      ? await tx.technicianAssignment.deleteMany({
          where: { jobId: id, userId },
        })
      : await tx.technicianAssignment.upsert({
          where: { jobId_userId: { jobId: id, userId } },
          create: { jobId: id, userId },
          update: {},
        });
    await audit(tx, a, "Job", id, remove ? "UNASSIGN" : "ASSIGN");
    return row;
  });
}
export async function appointment(a: Actor, id: string, raw: unknown) {
  office(a);
  await visibleJob(a, id);
  const data = appointmentInput.parse(raw);
  return db.$transaction(async (tx) => {
    const row = await tx.appointment.create({
      data: {
        ...data,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        jobId: id,
      },
    });
    await audit(tx, a, "Job", id, "APPOINTMENT_CREATE");
    return row;
  });
}
export async function removeAppointment(a: Actor, jobId: string, id: string) {
  admin(a);
  await visibleJob(a, jobId);
  idSchema.parse(id);
  return db.$transaction(async (tx) => {
    const row = await tx.appointment.deleteMany({ where: { id, jobId } });
    if (!row.count) throw new HttpError(404, "Appointment not found.");
    await audit(tx, a, "Job", jobId, "APPOINTMENT_DELETE");
    return row;
  });
}
export async function archive(a: Actor, kind: string, id: string) {
  admin(a);
  idSchema.parse(id);
  if (kind === "customers") await customer(a, id);
  else if (kind === "properties") await property(a, id);
  else if (kind === "jobs") await visibleJob(a, id);
  else throw new HttpError(404, "Not found.");
  return db.$transaction(async (tx) => {
    const data = { deletedAt: new Date() };
    if (kind === "customers") await tx.customer.update({ where: { id }, data });
    else if (kind === "properties")
      await tx.property.update({ where: { id }, data });
    else await tx.job.update({ where: { id }, data });
    await audit(tx, a, kind, id, "ARCHIVE");
    return { archived: true };
  });
}
export async function services(a: Actor) {
  const rows = await db.serviceCatalogItem.findMany({
    where: { organizationId: a.organizationId },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: { priceVersions: { orderBy: { effectiveFrom: "desc" } } },
  });
  // ADR-010: technicians can read descriptions, never financial settings/prices.
  return a.role === "TECHNICIAN"
    ? rows.map((r) => ({ ...r, priceVersions: [] }))
    : rows;
}
export async function saveService(a: Actor, raw: unknown, id?: string) {
  admin(a);
  const { unitPriceCents, ...data } = serviceInput.parse(raw);
  if (
    id &&
    !(await db.serviceCatalogItem.findFirst({
      where: { id: idSchema.parse(id), organizationId: a.organizationId },
    }))
  )
    throw new HttpError(404, "Service not found.");
  return db.$transaction(async (tx) => {
    // Serialize price versions so at most one is current, including concurrent edits.
    if (id)
      await tx.$queryRaw`SELECT id FROM "ServiceCatalogItem" WHERE id = ${id} FOR UPDATE`;
    const row = id
      ? await tx.serviceCatalogItem.update({ where: { id }, data })
      : await tx.serviceCatalogItem.create({
          data: { ...data, organizationId: a.organizationId },
        });
    if (unitPriceCents !== undefined) {
      const now = new Date();
      await tx.servicePriceVersion.updateMany({
        where: { serviceId: row.id, effectiveTo: null },
        data: { effectiveTo: now },
      });
      await tx.servicePriceVersion.create({
        data: { serviceId: row.id, unitPriceCents, effectiveFrom: now },
      });
    }
    await audit(tx, a, "ServiceCatalogItem", row.id, id ? "UPDATE" : "CREATE");
    return row;
  });
}
export async function technicians(a: Actor) {
  office(a);
  return db.user.findMany({
    where: {
      organizationId: a.organizationId,
      role: "TECHNICIAN",
      active: true,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
}
export async function dashboard(a: Actor) {
  const scoped = jobScope(a);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [customerCount, propertyCount, jobCount, activeJobs, scheduled] =
    await Promise.all([
      db.customer.count({ where: customerScope(a) }),
      db.property.count({ where: propertyScope(a) }),
      db.job.count({ where: scoped }),
      db.job.count({
        where: {
          AND: [scoped, { status: { notIn: ["COMPLETED", "CANCELLED"] } }],
        },
      }),
      db.appointment.findMany({
        where: {
          job: scoped,
          startsAt: {
            gte: new Date(Date.now() - 86400000),
            lte: new Date(Date.now() + 86400000),
          },
        },
        select: { startsAt: true, jobId: true },
      }),
    ]);
  const jobsToday = new Set(
    scheduled
      .filter(
        (r) =>
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Chicago",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(r.startsAt) === today,
      )
      .map((r) => r.jobId),
  ).size;
  if (a.role === "TECHNICIAN")
    return { customerCount, propertyCount, jobCount, activeJobs, jobsToday };
  const [
    openEstimates,
    sentEstimates,
    approvedEstimates,
    unpaidInvoices,
    outstanding,
    pendingInspections,
  ] = await Promise.all([
    db.estimate.count({
      where: {
        deletedAt: null,
        document: { organizationId: a.organizationId },
        customer: { deletedAt: null },
        property: { deletedAt: null },
        status: { in: ["DRAFT", "READY"] },
      },
    }),
    db.estimate.count({
      where: {
        deletedAt: null,
        document: { organizationId: a.organizationId },
        customer: { deletedAt: null },
        property: { deletedAt: null },
        status: "SENT",
      },
    }),
    db.estimate.count({
      where: {
        deletedAt: null,
        document: { organizationId: a.organizationId },
        customer: { deletedAt: null },
        property: { deletedAt: null },
        status: "APPROVED",
      },
    }),
    db.invoice.count({
      where: {
        deletedAt: null,
        document: { organizationId: a.organizationId },
        customer: { deletedAt: null },
        property: { deletedAt: null },
        status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
    }),
    db.invoice.aggregate({
      where: {
        deletedAt: null,
        document: { organizationId: a.organizationId },
        customer: { deletedAt: null },
        property: { deletedAt: null },
        status: { notIn: ["DRAFT", "VOID", "PAID"] },
      },
      _sum: { balanceCents: true },
    }),
    db.inspection.count({
      where: {
        deletedAt: null,
        document: { organizationId: a.organizationId },
        customer: { deletedAt: null },
        property: { deletedAt: null },
        status: "TECH_SIGNED",
      },
    }),
  ]);
  return {
    customerCount,
    propertyCount,
    jobCount,
    activeJobs,
    jobsToday,
    openEstimates,
    sentEstimates,
    approvedEstimates,
    unpaidInvoices,
    outstandingCents: outstanding._sum.balanceCents ?? 0,
    pendingInspections,
  };
}
