import { storedBytes } from "@/lib/c-documents";
import { actor } from "@/lib/access";
import { failure, sameOrigin, readJson, HttpError } from "@/lib/errors";
import * as ai from "@/lib/ai/service";
import { db } from "@/lib/db";
import { admin } from "@/lib/access";
import { z } from "zod";
export const runtime = "nodejs";
async function handle(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const a = await actor();
    const [kind, id, action] = (await params).path ?? [];
    if (req.method !== "GET") sameOrigin(req);
    if (kind === "config" && req.method === "POST") {
      admin(a);
      const data = z
        .object({ enabled: z.boolean() })
        .strict()
        .parse(await readJson(req));
      await db.organizationSettings.update({
        where: { organizationId: a.organizationId },
        data: { aiEnabled: data.enabled, aiProvider: "ANTHROPIC" },
      });
      return Response.json({ available: await ai.aiAvailable(a) });
    }
    if (kind === "availability" && req.method === "GET")
      return Response.json({ available: await ai.aiAvailable(a) });
    if (
      kind === "extractions" &&
      id &&
      action === "source" &&
      req.method === "GET"
    ) {
      const row = await ai.extraction(a, id);
      if (!row.request.sourceFileId)
        throw new HttpError(404, "Source not found.");
      const file = await ai.visibleFile(a, row.request.sourceFileId);
      return new Response(new Uint8Array(await storedBytes(file.storageKey)), {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": "inline",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (kind === "extractions" && id && req.method === "GET")
      return Response.json(await ai.extraction(a, id));
    if (
      kind === "extractions" &&
      id &&
      action === "accept" &&
      req.method === "POST"
    )
      return Response.json(
        await ai.acceptExtraction(a, id, await readJson(req)),
        { status: 201 },
      );
    if (
      kind === "extractions" &&
      id &&
      action === "edit" &&
      req.method === "POST"
    ) {
      const x = z
        .object({ instruction: z.string(), current: z.unknown() })
        .strict()
        .parse(await readJson(req));
      return Response.json(
        await ai.edit(a, id, x.instruction, x.current, req.signal),
      );
    }
    if (
      kind === "estimates" &&
      id &&
      action === "edit" &&
      req.method === "POST"
    ) {
      const x = z
        .object({ instruction: z.string(), current: z.unknown() })
        .strict()
        .parse(await readJson(req));
      return Response.json(
        await ai.edit(
          a,
          id,
          x.instruction,
          x.current,
          req.signal,
          undefined,
          "estimate",
        ),
      );
    }
    if (kind === "write" && req.method === "POST")
      return Response.json(await ai.write(a, await readJson(req), req.signal));
    if (kind === "extract" && req.method === "POST") {
      const reader = req.body?.getReader();
      if (!reader) throw new HttpError(400, "Select a source.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 11 * 1024 * 1024) {
            await reader.cancel();
            throw new HttpError(413, "Upload exceeds the 10 MiB file limit.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const form = await new Request(req.url, {
        method: "POST",
        headers: { "content-type": req.headers.get("content-type") ?? "" },
        body: Buffer.concat(chunks),
      }).formData();
      const file = form.get("file");
      const mode = z
        .enum(["DOCUMENT", "PHOTO", "TEXT"])
        .parse(form.get("mode"));
      return Response.json(
        await ai.extract(
          a,
          {
            mode,
            instruction: String(form.get("instruction") ?? ""),
            file: file instanceof File && file.size ? file : undefined,
          },
          req.signal,
        ),
        { status: 201 },
      );
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
}
export { handle as GET, handle as POST };
