import { readStored } from "@/lib/storage";
import { openStored } from "@/lib/storage";
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
      return new Response(await openStored(file.storageKey), {
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
      if (req.headers.get("content-type")?.startsWith("application/json")) {
        const data = z
          .object({
            instruction: z.string(),
            mode: z.enum(["DOCUMENT", "PHOTO", "TEXT"]),
            sourceFileId: z.string().optional(),
          })
          .strict()
          .parse(await readJson(req, 12000));
        let file: File | undefined;
        if (data.sourceFileId) {
          const row = await ai.visibleFile(a, data.sourceFileId);
          if (row.sizeBytes > 10 * 1024 * 1024)
            throw new HttpError(413, "File exceeds 10 MiB.");
          file = new File(
            [new Uint8Array(await readStored(row.storageKey))],
            row.filename,
            { type: row.mimeType },
          );
        }
        return Response.json(
          await ai.extract(
            a,
            {
              instruction: data.instruction,
              mode: data.mode,
              file,
              sourceFileId: data.sourceFileId,
            },
            req.signal,
          ),
          { status: 201 },
        );
      }

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
