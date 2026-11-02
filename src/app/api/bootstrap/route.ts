import { bootstrap } from "@/lib/bootstrap";
import { sameOrigin, readJson, failure } from "@/lib/errors";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    return Response.json(await bootstrap(await readJson(req, 4096)), {
      status: 201,
    });
  } catch (e) {
    return failure(e);
  }
}
