import { redirect } from "next/navigation";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Page() {
  redirect((await db.user.count()) ? "/dashboard" : "/setup");
}
