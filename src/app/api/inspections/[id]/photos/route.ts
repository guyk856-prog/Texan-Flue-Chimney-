import { actor } from "@/lib/access";
import { sameOrigin, failure, HttpError } from "@/lib/errors";
import { inspectionPhoto } from "@/lib/inspections";
import { MAX_FILE_SIZE } from "@/lib/files";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const a = await actor();
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError(400, "Photo required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > MAX_FILE_SIZE + 8192) {
        await reader.cancel();
        throw new HttpError(413, "Photo exceeds 10 MiB.");
      }
      chunks.push(r.value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Photo required.");
    return Response.json(
      await inspectionPhoto(a, (await params).id, file, {
        findingId: form.get("findingId"),
        caption: form.get("caption") ?? "",
        phase: form.get("phase") || null,
        pairKey: form.get("pairKey") || null,
      }),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
