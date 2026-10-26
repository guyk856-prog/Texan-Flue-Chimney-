import { actor, admin, visibleJob } from "@/lib/access";
import * as domain from "@/lib/domain";
import { failure, sameOrigin, readJson, HttpError } from "@/lib/errors";
import { db } from "@/lib/db";
import { fileScope, signedUrl, visibleFile } from "@/lib/files";
import { idSchema } from "@/lib/validation";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const a = await actor();
    const { path } = await context.params;
    const [kind, id, action, child] = path;
    if (path.length > 4) throw new HttpError(404, "Not found.");
    if (id) idSchema.parse(id);
    if (child) idSchema.parse(child);
    const method = request.method;
    if (method !== "GET") sameOrigin(request);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    if (method === "GET") {
      if (kind === "customers" && !action)
        return Response.json(
          id ? await domain.customer(a, id) : await domain.customers(a, q),
        );
      if (kind === "properties" && !action)
        return Response.json(
          id ? await domain.property(a, id) : await domain.properties(a, q),
        );
      if (kind === "jobs" && !action)
        return Response.json(
          id ? await visibleJob(a, id) : await domain.jobs(a, q),
        );
      if (kind === "services" && !id)
        return Response.json(await domain.services(a));
      if (kind === "technicians" && !id)
        return Response.json(await domain.technicians(a));
      if (kind === "dashboard" && !id)
        return Response.json(await domain.dashboard(a));
      if (kind === "files" && !id)
        return Response.json(
          await db.fileAsset.findMany({
            where: await fileScope(a),
            select: {
              id: true,
              filename: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
            take: 200,
            orderBy: { createdAt: "desc" },
          }),
        );
      if (kind === "files" && id && action === "link")
        return Response.json(await signedUrl(a, id));
      if (kind === "settings") {
        admin(a);
        if (id === "company")
          return Response.json(
            await db.organization.findUnique({
              where: { id: a.organizationId },
              include: { settings: true },
            }),
          );
        throw new HttpError(404, "Not found.");
      }
    }
    if (method === "DELETE" && id) {
      if (kind === "jobs" && action === "assignments" && child)
        return Response.json(
          await domain.assign(a, id, { userId: child }, true),
        );
      if (kind === "jobs" && action === "appointments" && child)
        return Response.json(await domain.removeAppointment(a, id, child));
      if (kind === "files" && !action) {
        admin(a);
        await visibleFile(a, id);
        await db.$transaction([
          db.fileAsset.update({
            where: { id },
            data: { deletedAt: new Date() },
          }),
          db.auditLog.create({
            data: {
              organizationId: a.organizationId,
              userId: a.id,
              entity: "FileAsset",
              entityId: id,
              action: "ARCHIVE",
            },
          }),
        ]);
        return Response.json({ archived: true });
      }
      if (!action) return Response.json(await domain.archive(a, kind, id));
    }
    if (["POST", "PATCH"].includes(method)) {
      if (Number(request.headers.get("content-length")) > 100_000)
        throw new HttpError(413, "Request too large.");
      const raw = await readJson(request);
      if (
        kind === "customers" &&
        !action &&
        ((method === "POST" && !id) || (method === "PATCH" && id))
      )
        return Response.json(await domain.saveCustomer(a, raw, id));
      if (
        kind === "properties" &&
        !action &&
        ((method === "POST" && !id) || (method === "PATCH" && id))
      )
        return Response.json(await domain.saveProperty(a, raw, id));
      if (
        kind === "jobs" &&
        !action &&
        ((method === "POST" && !id) || (method === "PATCH" && id))
      )
        return Response.json(await domain.saveJob(a, raw, id));
      if (
        kind === "services" &&
        !action &&
        ((method === "POST" && !id) || (method === "PATCH" && id))
      )
        return Response.json(await domain.saveService(a, raw, id));
      if (kind === "jobs" && id && method === "POST" && !child) {
        if (action === "status")
          return Response.json(await domain.setStatus(a, id, raw));
        if (action === "assignments")
          return Response.json(await domain.assign(a, id, raw));
        if (action === "appointments")
          return Response.json(await domain.appointment(a, id, raw));
      }
      if (kind === "settings") admin(a);
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
