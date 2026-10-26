import Link from "next/link";
import { notFound, redirect, forbidden } from "next/navigation";
import { actor, admin, office, visibleJob } from "@/lib/access";
import * as domain from "@/lib/domain";
import { HttpError } from "@/lib/errors";
import { db } from "@/lib/db";
import { fileScope } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { RecordForm, Archive } from "@/components/record-form";
import {
  customerFields,
  propertyFields,
  jobFields,
  serviceFields,
} from "@/components/fields";
import { JobControls } from "@/components/job-controls";
import { JobCreate } from "@/components/job-create";
import { FilesScreen } from "@/components/files-screen";
function Header({ title }: { title: string }) {
  return (
    <>
      <div className="eyebrow">Team workspace</div>
      <h1>{title}</h1>
    </>
  );
}
function Search({ value = "" }: { value?: string }) {
  return (
    <form className="toolbar">
      <label style={{ flex: 1 }}>
        Search
        <input
          name="q"
          defaultValue={value}
          placeholder="Name, phone, email or address"
          maxLength={200}
        />
      </label>
      <Button variant="outline">Search</Button>
    </form>
  );
}
function Empty() {
  return <p className="muted">No records found.</p>;
}
function Detail({ row }: { row: Record<string, unknown> }) {
  return (
    <dl className="grid">
      {Object.entries(row)
        .filter(
          ([k, v]) =>
            !k.endsWith("Id") &&
            ![
              "id",
              "deletedAt",
              "organizationId",
              "createdAt",
              "updatedAt",
              "jobs",
              "customer",
              "properties",
              "assignments",
              "appointments",
            ].includes(k) &&
            v !== null &&
            typeof v !== "object",
        )
        .map(([k, v]) => (
          <div key={k}>
            <dt className="muted">{k.replace(/([A-Z])/g, " $1")}</dt>
            <dd style={{ margin: ".4rem 0 1rem", whiteSpace: "pre-wrap" }}>
              {String(v) || "—"}
            </dd>
          </div>
        ))}
    </dl>
  );
}
async function renderPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{
    q?: string;
    customerId?: string;
    propertyId?: string;
  }>;
}) {
  const a = await actor();
  const { path } = await params;
  const [kind, id, sub] = path;
  const query = await searchParams;
  const canEdit = a.role !== "TECHNICIAN";
  if (path.length > 3) notFound();
  if (kind === "settings") {
    admin(a);
    if (id !== "company" || sub) notFound();
    const org = await db.organization.findUniqueOrThrow({
      where: { id: a.organizationId },
      include: { settings: true },
    });
    return (
      <>
        <Header title="Company settings" />
        <div className="panel">
          <h2>{org.name}</h2>
          <p>
            {org.addrLine1}, {org.city}, {org.state} {org.postal}
            <br />
            {org.phone}
          </p>
          <p>Fully Insured</p>
          <p className="muted">
            Tax: {org.settings?.taxEnabled ? "Enabled" : "Disabled"} · Fees:{" "}
            {org.settings?.feeEnabled ? "Enabled" : "Disabled"} · AI:{" "}
            {org.settings?.aiEnabled ? "Enabled" : "Disabled"}
          </p>
          <p className="muted">
            Company configuration is read-only in Phase A. Admins can edit
            catalog wording and price versions in the service library.
          </p>
        </div>
      </>
    );
  }
  if (kind === "dashboard" && !id) {
    const data = await domain.dashboard(a);
    return (
      <>
        <Header title="A clear view of the day." />
        <p className="muted">
          Live records for your{" "}
          {a.role === "TECHNICIAN" ? "assigned jobs" : "organization"}.
          Today&apos;s appointments use Dallas time.
        </p>
        <div className="toolbar">
          {canEdit && (
            <div className="actions">
              <Button asChild>
                <Link href="/customers/new">New customer</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/jobs/new">New job</Link>
              </Button>
            </div>
          )}
          <Link href="/files">Upload a file →</Link>
        </div>
        <div className="grid">
          {Object.entries(data).map(([key, value]) => (
            <div className="panel" key={key}>
              <div className="muted">
                {(
                  {
                    customerCount: "Customers",
                    propertyCount: "Properties",
                    jobCount: "Jobs",
                    activeJobs: "Active jobs",
                    jobsToday: "Jobs today",
                    openEstimates: "Open estimates",
                    sentEstimates: "Sent estimates",
                    approvedEstimates: "Approved estimates",
                    unpaidInvoices: "Unpaid invoices",
                    outstandingCents: "Outstanding balance",
                    pendingInspections: "Inspections pending review",
                  } as Record<string, string>
                )[key] ?? key}
              </div>
              <div className="metric">
                {key === "outstandingCents"
                  ? new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(value / 100)
                  : value}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (kind === "files" && !id) {
    const rows = await db.fileAsset.findMany({
      where: await fileScope(a),
      select: { id: true, filename: true, sizeBytes: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
    return (
      <>
        <Header title="Files" />
        <FilesScreen rows={rows} jobs={await domain.jobs(a)} />
      </>
    );
  }
  if (kind === "customers") {
    if (!id) {
      const rows = await domain.customers(a, query.q);
      return (
        <>
          <Header title="Customers" />
          <div className="toolbar">
            <p className="muted">People, properties and the next visit.</p>
            {canEdit && (
              <Button asChild>
                <Link href="/customers/new">New customer</Link>
              </Button>
            )}
          </div>
          <Search value={query.q} />
          <section className="panel">
            {!rows.length && <Empty />}
            {rows.map((c) => (
              <Link className="rowlink" href={`/customers/${c.id}`} key={c.id}>
                <strong>{c.name}</strong>
                <span className="muted">
                  {[c.phone, c.email].filter(Boolean).join(" · ")}
                </span>
              </Link>
            ))}
          </section>
        </>
      );
    }
    if (id === "new") {
      office(a);
      return (
        <>
          <Header title="New customer" />
          <section className="panel">
            <RecordForm
              fields={customerFields}
              endpoint="/api/data/customers"
              initial={{ preferredLang: "en" }}
              successPath="/customers/:id"
            />
          </section>
        </>
      );
    }
    const c = await domain.customer(a, id);
    return (
      <>
        <Header title={c.name} />
        <div className="panel">
          <Detail row={c} />
        </div>
        {canEdit && (
          <details className="panel">
            <summary>Edit customer</summary>
            <RecordForm
              fields={customerFields}
              endpoint={`/api/data/customers/${id}`}
              method="PATCH"
              initial={c}
            />
          </details>
        )}
        <section className="panel">
          <div className="toolbar">
            <h2>Properties</h2>
            {canEdit && (
              <Button asChild>
                <Link href={`/properties/new?customerId=${id}`}>
                  Add property
                </Link>
              </Button>
            )}
          </div>
          {!c.properties.length && <Empty />}
          {c.properties.map((p) => (
            <Link className="rowlink" key={p.id} href={`/properties/${p.id}`}>
              {p.line1}
              <span className="muted">
                {p.city}, {p.state}
              </span>
            </Link>
          ))}
        </section>
        <section className="panel">
          <h2>Jobs</h2>
          {!c.jobs.length && <Empty />}
          {c.jobs.map((j) => (
            <Link className="rowlink" href={`/jobs/${j.id}`} key={j.id}>
              {j.title}
              <span className="badge">{j.status}</span>
            </Link>
          ))}
        </section>
        {a.role === "ADMIN" && (
          <Archive endpoint={`/api/data/customers/${id}`} />
        )}
      </>
    );
  }
  if (kind === "properties") {
    if (!id) {
      const rows = await domain.properties(a, query.q);
      return (
        <>
          <Header title="Properties" />
          <Search value={query.q} />
          <section className="panel">
            {!rows.length && <Empty />}
            {rows.map((p) => (
              <Link className="rowlink" href={`/properties/${p.id}`} key={p.id}>
                {p.line1}
                <span className="muted">
                  {p.customer.name} · {p.city}
                </span>
              </Link>
            ))}
          </section>
        </>
      );
    }
    if (id === "new") {
      office(a);
      const customers = await domain.customers(a);
      return (
        <>
          <Header title="Add property" />
          <section className="panel">
            <RecordForm
              endpoint="/api/data/properties"
              fields={[
                {
                  name: "customerId",
                  label: "Customer",
                  type: "select",
                  required: true,
                  options: customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                },
                ...propertyFields,
              ]}
              initial={{ customerId: query.customerId, state: "TX" }}
              successPath="/properties/:id"
            />
          </section>
        </>
      );
    }
    const p = await domain.property(a, id);
    return (
      <>
        <Header title={p.line1} />
        <p>
          <Link href={`/customers/${p.customerId}`}>{p.customer.name} →</Link>
        </p>
        <section className="panel">
          <Detail row={p} />
        </section>
        {canEdit && (
          <>
            <div className="toolbar">
              <Button asChild>
                <Link
                  href={`/jobs/new?customerId=${p.customerId}&propertyId=${id}`}
                >
                  Open job
                </Link>
              </Button>
            </div>
            <details className="panel">
              <summary>Edit property</summary>
              <RecordForm
                endpoint={`/api/data/properties/${id}`}
                method="PATCH"
                fields={[
                  {
                    name: "customerId",
                    label: "Customer",
                    required: true,
                    type: "select",
                    options: [{ value: p.customerId, label: p.customer.name }],
                  },
                  ...propertyFields,
                ]}
                initial={p}
              />
            </details>
          </>
        )}
        <section className="panel">
          <h2>Jobs</h2>
          {!p.jobs.length && <Empty />}
          {p.jobs.map((j) => (
            <Link className="rowlink" href={`/jobs/${j.id}`} key={j.id}>
              {j.title}
              <span>{j.status}</span>
            </Link>
          ))}
        </section>
        {a.role === "ADMIN" && (
          <Archive endpoint={`/api/data/properties/${id}`} />
        )}
      </>
    );
  }
  if (kind === "jobs") {
    if (!id) {
      const rows = await domain.jobs(a, query.q);
      return (
        <>
          <Header title="Jobs" />
          <div className="toolbar">
            <p className="muted">
              {canEdit
                ? "From first enquiry to completed work."
                : "Your assigned work."}
            </p>
            {canEdit && (
              <Button asChild>
                <Link href="/jobs/new">New job</Link>
              </Button>
            )}
          </div>
          <Search value={query.q} />
          <section className="panel">
            {!rows.length && <Empty />}
            {rows.map((j) => (
              <Link className="rowlink" href={`/jobs/${j.id}`} key={j.id}>
                <div>
                  <strong>{j.title}</strong>
                  <p className="muted">
                    {j.number} · {j.customer.name} · {j.property.line1}
                  </p>
                </div>
                <span className="badge">{j.status}</span>
              </Link>
            ))}
          </section>
        </>
      );
    }
    if (id === "new") {
      office(a);
      return (
        <>
          <Header title="New job" />
          <section className="panel">
            <JobCreate
              customers={await domain.customers(a)}
              properties={await domain.properties(a)}
              customerId={query.customerId}
              propertyId={query.propertyId}
            />
          </section>
        </>
      );
    }
    const j = await visibleJob(a, id);
    return (
      <>
        <Header title={j.title} />
        <p className="muted">
          {j.number} · {j.status}
        </p>
        <section className="panel">
          <p>
            <Link href={`/customers/${j.customerId}`}>{j.customer.name} →</Link>
          </p>
          <p>
            <Link href={`/properties/${j.propertyId}`}>
              {j.property.line1} →
            </Link>
          </p>
          <Detail row={j} />
        </section>
        {canEdit ? (
          <>
            <details className="panel">
              <summary>Edit job details</summary>
              <RecordForm
                fields={[
                  {
                    name: "customerId",
                    label: "Customer",
                    required: true,
                    type: "select",
                    options: [{ value: j.customerId, label: j.customer.name }],
                  },
                  {
                    name: "propertyId",
                    label: "Property",
                    required: true,
                    type: "select",
                    options: [{ value: j.propertyId, label: j.property.line1 }],
                  },
                  ...jobFields,
                ]}
                initial={j}
                method="PATCH"
                endpoint={`/api/data/jobs/${id}`}
              />
            </details>
            <JobControls
              id={id}
              status={j.status}
              technicians={await domain.technicians(a)}
              assignments={j.assignments}
              appointments={j.appointments}
              admin={a.role === "ADMIN"}
            />
          </>
        ) : (
          <section className="panel">
            <h2>Appointments</h2>
            {j.appointments.map((t) => (
              <p key={t.id}>
                {t.startsAt.toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })}{" "}
                Dallas time · {t.note}
              </p>
            ))}
            {!j.appointments.length && <Empty />}
          </section>
        )}
        {a.role === "ADMIN" && <Archive endpoint={`/api/data/jobs/${id}`} />}
      </>
    );
  }
  if (kind === "services" && !id) {
    const rows = await domain.services(a);
    return (
      <>
        <Header title="Service library" />
        <p className="muted">
          Wood-burning chimney work and dryer vents. DEMO starter wording must
          be reviewed before use. No prices are invented.
        </p>
        {a.role === "ADMIN" && (
          <details className="panel">
            <summary>Add service</summary>
            <RecordForm
              endpoint="/api/data/services"
              fields={serviceFields}
              initial={{ active: true, unit: "each" }}
            />
          </details>
        )}
        {rows.map((s) => (
          <section className="panel" key={s.id}>
            <div className="toolbar">
              <h2>{s.title}</h2>
              <span className="badge">
                {s.active ? "Active" : "Inactive"} · {s.category}
              </span>
            </div>
            <p>{s.description}</p>
            {s.companyDefinedTerm && (
              <p className="badge">
                Company-defined term. Not an NFPA inspection level.
              </p>
            )}
            <ul>
              {s.scopeSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
            {a.role !== "TECHNICIAN" && (
              <>
                <h3>Price history (integer cents)</h3>
                {!s.priceVersions.length && (
                  <p className="muted">No price configured.</p>
                )}
                {s.priceVersions.map((p) => (
                  <p className="muted" key={p.id}>
                    {p.unitPriceCents} cents · {p.effectiveFrom.toISOString()} ·{" "}
                    {p.effectiveTo ? "Previous" : "Current"}
                  </p>
                ))}
              </>
            )}
            {a.role === "ADMIN" && (
              <details>
                <summary>Edit catalog entry / add price version</summary>
                <RecordForm
                  endpoint={`/api/data/services/${s.id}`}
                  method="PATCH"
                  initial={s}
                  fields={serviceFields}
                />
              </details>
            )}
          </section>
        ))}
      </>
    );
  }
  notFound();
}
export default async function Page(props: Parameters<typeof renderPage>[0]) {
  try {
    return await renderPage(props);
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401) redirect("/login");
      if (e.status === 404) notFound();
      if (e.status === 403) forbidden();
    }
    throw e;
  }
}
