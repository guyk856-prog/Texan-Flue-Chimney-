import { sameOrigin, readJson, failure, HttpError } from "@/lib/errors";
import { requestReset, resetPassword } from "@/lib/password-reset";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(request);
    const { action } = await params;
    if (Number(request.headers.get("content-length")) > 4096)
      throw new HttpError(413, "Request too large.");
    const input = await readJson(request, 4096);
    if (action === "request") return Response.json(await requestReset(input));
    if (action === "reset") return Response.json(await resetPassword(input));
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
}
