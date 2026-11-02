import { db } from "@/lib/db";
import { actor, admin } from "@/lib/access";
import { redirect } from "next/navigation";
import { BootstrapForm, SetupWizard } from "@/components/setup-wizard";
export const dynamic = "force-dynamic";
export default async function Setup() {
  if (!(await db.user.count()))
    return (
      <main id="main-content">
        <BootstrapForm />
      </main>
    );
  let a;
  try {
    a = await actor();
  } catch {
    redirect("/login?returnTo=%2Fsetup");
  }
  admin(a);
  const org = await db.organization.findUniqueOrThrow({
    where: { id: a.organizationId },
  });
  return (
    <main id="main-content">
      <SetupWizard
        company={{
          name: org.name,
          phone: org.phone,
          email: org.email,
          addrLine1: org.addrLine1,
          city: org.city,
          state: org.state,
          postal: org.postal,
        }}
      />
    </main>
  );
}
