import { actor } from "@/lib/access";
import { failure } from "@/lib/errors";
import { download } from "@/lib/files";
import { idSchema } from "@/lib/validation";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await actor();
    const { id } = await params;
    idSchema.parse(id);
    const url = new URL(request.url);
    const { row, bytes } = await download(
      a,
      id,
      Number(url.searchParams.get("expires")),
      url.searchParams.get("signature") ?? "",
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
