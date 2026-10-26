import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function failure(e: unknown) {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError)
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  if (e instanceof ZodError)
    return Response.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    return Response.json(
      { error: "That value already exists." },
      { status: 409 },
    );
  console.error("Request failed", e instanceof Error ? e.name : "UnknownError");
  return Response.json(
    { error: "Unable to complete request." },
    { status: 500 },
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(process.env.AUTH_URL!).origin)
    throw new HttpError(403, "Invalid request origin.");
}

export async function readJson(
  request: Request,
  maxBytes = 100_000,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new HttpError(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Request too large.");
    }
    chunks.push(next.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
