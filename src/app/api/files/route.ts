import { actor } from "@/lib/access";
import { failure, sameOrigin, HttpError } from "@/lib/errors";
import { upload, MAX_FILE_SIZE } from "@/lib/files";
import { idSchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor();
    if (Number(request.headers.get("content-length")) > MAX_FILE_SIZE + 8192)
      throw new HttpError(413, "File exceeds the 10 MiB limit.");
    // Bound streamed multipart bodies too; never buffer an unbounded chunked request.
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "File is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > MAX_FILE_SIZE + 8192) {
        await reader.cancel();
        throw new HttpError(413, "File exceeds the 10 MiB limit.");
      }
      chunks.push(r.value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "File is required.");
    const rawId = form.get("jobId");
    const jobId = rawId ? idSchema.parse(rawId) : undefined;
    return Response.json(await upload(a, file, jobId), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
