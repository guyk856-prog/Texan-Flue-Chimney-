import { actor } from "@/lib/access";
import { failure, sameOrigin, readJson, HttpError } from "@/lib/errors";
import * as invoices from "@/lib/invoices";
import * as inspections from "@/lib/inspections";
import { createShare, revokeShare } from "@/lib/sharing";
import { docAccess } from "@/lib/c-documents";
import { db } from "@/lib/db";
import { signedUrl } from "@/lib/files";
import { idSchema } from "@/lib/validation";
export const runtime = "nodejs";
async function handle(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const a = await actor();
    const path = (await params).path ?? [];
    const [kind, id, action, child] = path;
    if (path.length > 4) throw new HttpError(404, "Not found.");
    if (id) idSchema.parse(id);
    if (child) idSchema.parse(child);
    if (req.method !== "GET") sameOrigin(req);
    if (kind === "invoices") {
      if (req.method === "PATCH" && id && !action)
        return Response.json(
          await invoices.createInvoice(a, await readJson(req), id),
        );
      if (req.method === "GET" && !action)
        return Response.json(
          id
            ? await invoices.readInvoice(a, id)
            : await invoices.listInvoices(a),
        );
      if (req.method === "POST") {
        if (!id)
          return Response.json(
            await invoices.createInvoice(a, await readJson(req)),
            { status: 201 },
          );
        if (action === "issue")
          return Response.json(await invoices.issueInvoice(a, id));
        if (action === "payments" && !child)
          return Response.json(
            await invoices.recordPayment(a, id, await readJson(req)),
            { status: 201 },
          );
        if (action === "payments" && child)
          return Response.json(
            await invoices.reversePayment(a, id, child, await readJson(req)),
          );
        if (action === "void")
          return Response.json(
            await invoices.voidInvoice(a, id, await readJson(req)),
          );
      }
    }
    if (kind === "receipts" && req.method === "GET" && !action)
      return Response.json(
        id ? await invoices.readReceipt(a, id) : await invoices.listReceipts(a),
      );
    if (kind === "inspections") {
      if (id === "templates") {
        if (req.method === "GET")
          return Response.json(await inspections.checklistTemplates(a));
        if (req.method === "POST")
          return Response.json(
            await inspections.saveChecklist(a, await readJson(req)),
          );
      }
      if (req.method === "GET" && !action)
        return Response.json(
          id
            ? await inspections.readInspection(a, id)
            : await inspections.listInspections(a),
        );
      if (req.method === "POST") {
        if (!id)
          return Response.json(
            await inspections.createInspection(a, await readJson(req)),
            { status: 201 },
          );
        if (action === "signoff")
          return Response.json(
            await inspections.signoffInspection(a, id, await readJson(req)),
          );
        if (action === "finalize")
          return Response.json(await inspections.finalizeInspection(a, id));
        if (action === "repairs")
          return Response.json(
            await inspections.repairs(a, id, await readJson(req)),
          );
      }
      if (req.method === "PATCH" && id && !action)
        return Response.json(
          await inspections.saveInspection(a, id, await readJson(req, 500000)),
        );
    }
    if (kind === "documents" && id) {
      const doc = await docAccess(a, id);
      if (req.method === "GET" && action === "shares")
        return Response.json(
          await db.documentShareToken.findMany({
            where: { documentId: id },
            select: {
              id: true,
              version: true,
              createdAt: true,
              expiresAt: true,
              revokedAt: true,
              firstViewedAt: true,
              viewCount: true,
            },
          }),
        );
      if (req.method === "POST" && action === "share")
        return Response.json(await createShare(a, id), { status: 201 });
      if (req.method === "DELETE" && action === "shares" && child)
        return Response.json(await revokeShare(a, id, child));
      if (req.method === "GET" && action === "pdf") {
        const raw = new URL(req.url).searchParams.get("version");
        const version = raw ? Number(raw) : doc.currentVersion;
        if (!Number.isSafeInteger(version) || version < 1)
          throw new HttpError(400, "Invalid version.");
        const v = await db.documentVersion.findUnique({
          where: { documentId_version: { documentId: id, version } },
        });
        if (!v?.issuedAt || !v.pdfFileId)
          throw new HttpError(404, "PDF not found.");
        return Response.json(await signedUrl(a, v.pdfFileId));
      }
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
