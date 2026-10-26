import { Prisma, UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "./db";
import { HttpError } from "./errors";
export type Actor = {
  id: string;
  organizationId: string;
  role: UserRole;
  name: string;
};
export async function actor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "Please sign in.");
  const user = await db.user.findFirst({
    where: { id: session.user.id, active: true, deletedAt: null },
    select: { id: true, organizationId: true, role: true, name: true },
  });
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}
export function office(a: Actor) {
  if (a.role === "TECHNICIAN")
    throw new HttpError(403, "Office access required.");
}
export function admin(a: Actor) {
  if (a.role !== "ADMIN")
    throw new HttpError(403, "Administrator access required.");
}
export function jobScope(a: Actor): Prisma.JobWhereInput {
  return {
    organizationId: a.organizationId,
    deletedAt: null,
    customer: { deletedAt: null },
    property: { deletedAt: null },
    ...(a.role === "TECHNICIAN"
      ? { assignments: { some: { userId: a.id } } }
      : {}),
  };
}
export function customerScope(a: Actor): Prisma.CustomerWhereInput {
  return {
    organizationId: a.organizationId,
    deletedAt: null,
    ...(a.role === "TECHNICIAN" ? { jobs: { some: jobScope(a) } } : {}),
  };
}
export function propertyScope(a: Actor): Prisma.PropertyWhereInput {
  return {
    deletedAt: null,
    customer: { organizationId: a.organizationId, deletedAt: null },
    ...(a.role === "TECHNICIAN" ? { jobs: { some: jobScope(a) } } : {}),
  };
}
export async function visibleJob(a: Actor, id: string) {
  const job = await db.job.findFirst({
    where: { AND: [jobScope(a), { id }] },
    include: {
      customer: true,
      property: true,
      assignments: { include: { user: { select: { id: true, name: true } } } },
      appointments: { orderBy: { startsAt: "asc" } },
    },
  });
  if (!job) throw new HttpError(404, "Job not found.");
  return job;
}
