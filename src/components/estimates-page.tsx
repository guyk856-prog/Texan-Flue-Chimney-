import Link from "next/link";
import { type Actor, office, admin } from "@/lib/access";
import { db } from "@/lib/db";
import * as estimates from "@/lib/estimates";
import * as domain from "@/lib/domain";
import { EstimateBuilder } from "./estimate-builder";
import { EstimateActions } from "./estimate-actions";
import { TemplateEditor } from "./template-editor";
import { Button } from "./ui/button";
import { snapshotSchema } from "@/lib/snapshot";
import { formatCents } from "@/lib/money";
import { parseLayout } from "@/lib/template-contract";
import type { EstimateInput } from "@/lib/estimate-contract";
export async function EstimatesPage({ a, id }: { a: Actor; id?: string }) {
  if (id === "templates") {
    admin(a);
    const rows = await estimates.templates(a);
    return (
      <>
        <h1>Document templates</h1>
        <TemplateEditor
          initial={rows[0] ? parseLayout(JSON.parse(rows[0].source)) : null}
        />
      </>
    );
  }
  if (!id) {
    const rows = await estimates.listEstimates(a);
    return (
      <>
        <h1>Estimates</h1>
        <div className="toolbar">
          <p className="muted">
            Proposals with exact-cent totals and frozen issued versions.
          </p>
          {a.role !== "TECHNICIAN" && (
            <Button asChild>
              <Link href="/estimates/new">New estimate</Link>
            </Button>
          )}
        </div>
        <section className="panel">
          {!rows.length && <p>No estimates yet.</p>}
          {rows.map((row) => (
            <Link
              key={row.id}
              className="rowlink"
              href={`/estimates/${row.id}`}
            >
              <div>
                <strong>{row.document.number}</strong>
                <p className="muted">{row.customer.name}</p>
              </div>
              <span>
                {formatCents(row.totalCents)} · {row.status}
              </span>
            </Link>
          ))}
        </section>
      </>
    );
  }
  const isNew = id === "new";
  if (isNew) office(a);
  const row = isNew ? null : await estimates.readEstimate(a, id);
  const issued = !!row?.document.versions[0]?.issuedAt;
  const snapshot = row
    ? snapshotSchema.parse(row.document.versions[0].snapshot)
    : null;
  let builder = null;
  if (!issued && a.role !== "TECHNICIAN") {
    const [customers, properties, jobs, services, settings] = await Promise.all(
      [
        domain.customers(a),
        domain.properties(a),
        domain.jobs(a),
        domain.services(a),
        db.organizationSettings.findUniqueOrThrow({
          where: { organizationId: a.organizationId },
        }),
      ],
    );
    const initial: EstimateInput = row
      ? estimates.inputFromRow(row)
      : {
          customerId: "",
          propertyId: "",
          jobId: null,
          lineItems: [],
          discountCents: 0,
          depositRequestCents: 0,
          terms: settings.defaultTerms ?? "",
          exclusions: settings.defaultExclusions ?? "",
          assumptions: "",
          warrantyTerms: "",
          customerNote: "",
          internalNote: "",
          validUntil: estimates.defaultValidUntil(settings.estimateValidDays),
          preferences: {
            includeTax: true,
            includeFee: true,
            removalConfirmed: false,
          },
        };
    builder = (
      <EstimateBuilder
        key={row?.updatedAt.toISOString() ?? "new"}
        id={row?.id}
        initial={initial}
        customers={customers}
        properties={properties}
        jobs={jobs}
        services={services
          .filter((s) => s.active)
          .map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            unit: s.unit,
            companyDefinedTerm: s.companyDefinedTerm,
            scopeSteps: s.scopeSteps,
            price:
              s.priceVersions.find((p) => !p.effectiveTo)?.unitPriceCents ??
              null,
          }))}
        settings={settings}
      />
    );
  }
  return (
    <>
      <div className="eyebrow">Customer proposals</div>
      <h1>{row ? row.document.number : "New estimate"}</h1>
      {row && (
        <>
          <p className="muted">
            {row.status} · {row.customer.name}
            {issued ? " · Issued content is frozen." : " · Unissued draft"}
          </p>
          {row.supersedes && (
            <p>
              <Link href={`/estimates/${row.supersedes.id}`}>
                Previous estimate: {row.supersedes.document.number} →
              </Link>
            </p>
          )}
          {row.supersededBy && (
            <p>
              <Link href={`/estimates/${row.supersededBy.id}`}>
                Revised estimate: {row.supersededBy.document.number} →
              </Link>
            </p>
          )}
          <EstimateActions
            key={row.updatedAt.toISOString()}
            id={row.id}
            status={row.status}
            issued={issued}
            canEdit={a.role !== "TECHNICIAN"}
          />
        </>
      )}
      {snapshot && issued && (
        <section className="panel">
          <h2>Issued version {snapshot.document.version}</h2>
          <p>
            {snapshot.customer.name} · {snapshot.property.line1}
          </p>
          {snapshot.lines.map((l, i) => (
            <div className="rowlink" key={i}>
              <div>
                <strong>{l.title}</strong>
                <p className="muted">{l.description}</p>
                {l.companyDefinedTerm && (
                  <>
                    <p>
                      Company-defined cleaning term; not an NFPA inspection
                      level.
                    </p>
                    <ul>
                      {l.scopeSteps.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <span>
                {l.quantity} × {formatCents(l.unitPriceCents)} ={" "}
                {formatCents(l.lineTotalCents)}
              </span>
            </div>
          ))}
          <p>Subtotal: {formatCents(snapshot.totals.subtotalCents)}</p>
          <p>
            {snapshot.tax.label}:{" "}
            {snapshot.tax.enabled
              ? formatCents(snapshot.totals.taxCents)
              : "Not included"}{" "}
            · {snapshot.fee.label}:{" "}
            {snapshot.fee.enabled
              ? formatCents(snapshot.totals.feeCents)
              : "Not included"}
          </p>
          <h2>Total: {formatCents(snapshot.totals.totalCents)}</h2>
          <p className="muted">{snapshot.disclaimer}</p>
        </section>
      )}
      {builder}
    </>
  );
}
