import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadShare, visitor } from "@/lib/sharing";
import { HttpError } from "@/lib/errors";
import { CustomerShare } from "@/components/customer-share";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let data;
  try {
    data = await loadShare(token, visitor(new Headers(await headers())));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return <CustomerShare token={token} {...data} />;
}
