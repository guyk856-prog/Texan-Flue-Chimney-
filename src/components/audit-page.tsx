import { db } from "@/lib/db";
import { admin, type Actor } from "@/lib/access";
import { EmptyState } from "./app-states";
import { businessInstant } from "@/lib/business-date";
export async function AuditPage({
  a,
  query = "",
}: {
  a: Actor;
  query?: string;
}) {
  admin(a);
  const rows = await db.auditLog.findMany({
    where: {
      organizationId: a.organizationId,
      ...(query
        ? {
            OR: [
              { entity: { contains: query, mode: "insensitive" } },
              { action: { contains: query, mode: "insensitive" } },
              { entityId: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <h1>Audit log</h1>
      <p>
        Who changed what and when. Recent 200 events for your organization;
        narrow the search to find a record.
      </p>
      <form>
        <label>
          Find an action or record
          <input name="q" defaultValue={query} maxLength={200} />
        </label>
        <button>Search audit log</button>
      </form>
      {!rows.length && (
        <EmptyState
          title="No matching audit events"
          description="Changes and exports are recorded here. Confirm company details to record your first setup event."
          href="/setup"
          action="Open guided setup"
        />
      )}
      {rows.map((r) => (
        <section className="panel" key={r.id}>
          <h2>{r.action}</h2>
          <p>
            {r.user?.name ?? "Customer / system"} ·{" "}
            {businessInstant(r.createdAt.toISOString())}
          </p>
          <p>
            {r.entity} · {r.entityId}
          </p>
          {r.after && (
            <details>
              <summary>View recorded change</summary>
              <pre>{JSON.stringify(r.after, null, 2)}</pre>
            </details>
          )}
        </section>
      ))}
    </>
  );
}
