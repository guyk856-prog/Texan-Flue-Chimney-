import { auth } from "@/auth";
export async function GET() {
  const session = await auth();
  return Response.json(
    {
      active: !!session?.user?.id,
      expiresAt: session?.user?.id ? session.expires : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
