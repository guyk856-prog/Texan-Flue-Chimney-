import { sameOrigin, readJson, failure } from "@/lib/errors";
import { limit } from "@/lib/security";
import { reportEvent } from "@/lib/monitoring";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await limit("client-monitor", 100, 60000);
    const v = z
      .object({
        code: z.enum([
          "PAGE_RENDER_FAILED",
          "BROWSER_RUNTIME_FAILED",
          "BROWSER_PROMISE_FAILED",
        ]),
        reference: z.string().max(80).nullable().optional(),
      })
      .strict()
      .parse(await readJson(req, 1000));
    return Response.json(
      { reference: await reportEvent(v.code, v.reference ?? undefined) },
      { status: 202 },
    );
  } catch (e) {
    return failure(e);
  }
}
