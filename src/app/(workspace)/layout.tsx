import { AIProvider } from "@/components/ai-tools";
import { aiAvailable } from "@/lib/ai/service";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { actor } from "@/lib/access";
import { HttpError } from "@/lib/errors";
import { SignOut } from "@/components/sign-out";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let a;
  try {
    a = await actor();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    throw e;
  }
  return (
    <AIProvider enabled={await aiAvailable(a)}>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/dashboard" className="wordmark">
            <Image
              src="/brand/logo-on-dark.webp"
              width={40}
              height={40}
              alt="Texan Flue Chimney Service"
            />
          </Link>
          <p
            className="tagline muted"
            style={{ color: "#b9ae97", fontSize: 10, letterSpacing: ".12em" }}
          >
            WHERE CHIMNEYS MEET LUXURY
          </p>
          <nav aria-label="Main navigation">
            {[
              "Dashboard",
              "Customers",
              "Properties",
              "Jobs",
              "Estimates",
              "Invoices",
              "Inspections",
              "Receipts",
              "Services",
              "Files",
              ...(a.role === "ADMIN" ? ["Settings"] : []),
            ].map((item) => (
              <Link
                key={item}
                href={
                  item === "Settings"
                    ? "/settings/company"
                    : `/${item.toLowerCase()}`
                }
              >
                {item === "Services" ? "Service library" : item}
              </Link>
            ))}
          </nav>
          <p>{a.name}</p>
          <p className="muted" style={{ color: "#b9ae97" }}>
            {a.role}
          </p>
          <SignOut />
          <p
            className="tagline muted"
            style={{ marginTop: 40, color: "#b9ae97" }}
          >
            Wood-burning chimney work
            <br />
            &amp; dryer vents
            <br />
            <br />
            469-771-7000
          </p>
        </aside>
        <main>{children}</main>
      </div>
    </AIProvider>
  );
}
