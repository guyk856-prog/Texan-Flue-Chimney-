import { actor, admin } from "@/lib/access";
import { failure, sameOrigin, readJson, HttpError } from "@/lib/errors";
import * as estimates from "@/lib/estimates";
import { idSchema } from "@/lib/validation";
import { signedUrl } from "@/lib/files";
export const runtime = "nodejs";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const a = await actor();
    const parts = (await params).path ?? [];
    const [id, action] = parts;
    if (parts.length > 2) throw new HttpError(404, "Not found.");
    if (id) idSchema.parse(id);
    if (request.method !== "GET") sameOrigin(request);
    if (id === "templates") {
      admin(a);
      if (action) throw new HttpError(404, "Not found.");
      if (request.method === "GET")
        return Response.json(await estimates.templates(a));
      if (request.method === "POST")
        return Response.json(
          await estimates.saveTemplate(a, await readJson(request)),
        );
    }
    if (request.method === "GET") {
      if (!id) return Response.json(await estimates.listEstimates(a));
      if (!action) return Response.json(await estimates.readEstimate(a, id));
      if (action === "preview") {
        const { pdf } = await estimates.previewEstimate(a, id);
        return new Response(new Uint8Array(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": "inline; filename=estimate-preview.pdf",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (action === "download") {
        const row = await estimates.readEstimate(a, id);
        const version = row.document.versions.find((v) => v.issuedAt);
        if (!version?.pdfFileId)
          throw new HttpError(
            409,
            "Issue the estimate before downloading its frozen PDF.",
          );
        return Response.json(await signedUrl(a, version.pdfFileId));
      }
    }
    if (request.method === "POST") {
      if (!id)
        return Response.json(
          await estimates.saveEstimate(a, await readJson(request)),
          { status: 201 },
        );
      if (action === "issue")
        return Response.json(await estimates.issueEstimate(a, id));
      if (action === "duplicate" || action === "revise")
        return Response.json(
          await estimates.duplicateEstimate(a, id, action === "revise"),
          { status: 201 },
        );
      if (action === "status")
        return Response.json(
          await estimates.setEstimateStatus(a, id, await readJson(request)),
        );
    }
    if (request.method === "PATCH" && id && !action)
      return Response.json(
        await estimates.saveEstimate(a, await readJson(request), id),
      );
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
