import { loadShare, sharePdf, signShare, visitor } from "@/lib/sharing";
import { failure, sameOrigin, readJson, HttpError } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  try {
    const { token, path } = await params;
    if (path?.length) {
      if (path.join("/") !== "pdf")
        throw new HttpError(404, "This link is unavailable.");
      const { bytes, filename } = await sharePdf(token, visitor(req.headers));
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    return Response.json(await loadShare(token, visitor(req.headers)), {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  try {
    sameOrigin(req);
    const { token, path } = await params;
    if (path?.length) throw new HttpError(404, "This link is unavailable.");
    return Response.json(
      await signShare(token, visitor(req.headers), await readJson(req, 10000)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
