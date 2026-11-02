import { NextResponse } from "next/server";
import { auth } from "./auth";
import { db } from "./lib/db";
import { visibleJob } from "./lib/access";
import { customer, property } from "./lib/domain";
import { readEstimate } from "./lib/estimates";
import { readInvoice, readReceipt } from "./lib/invoices";
import { readInspection } from "./lib/inspections";
import { HttpError } from "./lib/errors";
// Authorize before a Suspense loading response commits HTTP headers. Mutations and
// page reads still repeat their own authorization; this preserves real 404/403 status codes.
export default auth(async (req) => {
  const userId = req.auth?.user?.id;
  if (!userId) {
    const url = new URL("/login", req.url);
    url.searchParams.set("returnTo", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  const a = await db.user.findFirst({
    where: { id: userId, active: true, deletedAt: null },
    select: { id: true, name: true, role: true, organizationId: true },
  });
  if (!a) return NextResponse.redirect(new URL("/login", req.url));
  const [kind, id] = req.nextUrl.pathname.split("/").filter(Boolean);
  try {
    if (kind === "settings" && a.role !== "ADMIN")
      throw new HttpError(403, "Your role cannot open settings.");
    if (id === "new" && a.role === "TECHNICIAN" && kind !== "inspections")
      throw new HttpError(403, "Office access is required.");
    if (id && !["new", "ai"].includes(id)) {
      if (kind === "jobs") await visibleJob(a, id);
      if (kind === "customers") await customer(a, id);
      if (kind === "properties") await property(a, id);
      if (kind === "estimates") await readEstimate(a, id);
      if (kind === "invoices") await readInvoice(a, id);
      if (kind === "inspections") await readInspection(a, id);
      if (kind === "receipts") await readReceipt(a, id);
    }
    return NextResponse.next();
  } catch (e) {
    if (e instanceof HttpError) {
      const forbidden = e.status === 403;
      return new NextResponse(
        `<!doctype html><html lang="en"><head><title>${forbidden ? "Access restricted" : "Record unavailable"} | Texan Flue</title><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body style="font:16px Arial;background:#f6f4f0;color:#111;padding:24px"><main><h1>${forbidden ? "Access restricted" : "Not found"}</h1><p>${forbidden ? "This action needs a different team role. Ask the owner to review your access." : "This record is unavailable. Check the link or open your assigned work."}</p><a style="display:inline-block;padding:16px;color:#684e1d" href="/dashboard">Back to dashboard</a></main></body></html>`,
        {
          status: e.status,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }
    throw e;
  }
});
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/properties/:path*",
    "/jobs/:path*",
    "/estimates/:path*",
    "/invoices/:path*",
    "/inspections/:path*",
    "/receipts/:path*",
    "/services/:path*",
    "/files/:path*",
    "/settings/:path*",
  ],
};
