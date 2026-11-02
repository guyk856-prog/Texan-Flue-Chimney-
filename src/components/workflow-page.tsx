import { EmptyState } from "./app-states";
import Link from "next/link";
import { type Actor, admin, office } from "@/lib/access";
import * as invoices from "@/lib/invoices";
import * as inspections from "@/lib/inspections";
import * as domain from "@/lib/domain";
import { db } from "@/lib/db";
import { snapshotSchema } from "@/lib/snapshot";
import { formatCents } from "@/lib/money";
import { defaultValidUntil, listEstimates } from "@/lib/estimates";
import { Button } from "./ui/button";
import { DocumentActions, WorkflowButton } from "./document-actions";
import { InvoiceForm } from "./invoice-form";
import { InvoiceLedger } from "./invoice-ledger";
import { InspectionCreate } from "./inspection-create";
import { InspectionEditor } from "./inspection-editor";
import { InspectionRepairs } from "./inspection-repairs";
import { ChecklistEditor } from "./checklist-editor";
import { CHIMNEY_CHECKLIST, DRYER_CHECKLIST } from "@/lib/checklists";
import { notFound } from "next/navigation";
function timestamp() {
  return new Date().toISOString().slice(0, 16);
}
export async function WorkflowPage({
  a,
  kind,
  id,
  sourceId,
}: {
  a: Actor;
  kind: string;
  id?: string;
  sourceId?: string;
}) {
  const canWrite = a.role !== "TECHNICIAN";
  if (kind === "checklists") {
    admin(a);
    const templates = await inspections.checklistTemplates(a);
    return (
      <>
        <h1>Inspection checklists</h1>
        {(["CHIMNEY", "DRYER_VENT"] as const).map((kind) => {
          const source = templates.find(
            (t) =>
              t.type ===
              (kind === "CHIMNEY" ? "INSPECTION" : "DRYER_VENT_REPORT"),
          );
          return (
            <ChecklistEditor
              key={kind}
              kind={kind}
              initial={
                source
                  ? JSON.parse(source.source).checklist
                  : kind === "CHIMNEY"
                    ? CHIMNEY_CHECKLIST
                    : DRYER_CHECKLIST
              }
            />
          );
        })}
      </>
    );
  }
  if (kind === "invoices") {
    if (!id) {
      const rows = await invoices.listInvoices(a);
      return (
        <>
          <h1>Invoices</h1>
          <div className="toolbar">
            <p>
              Balances derive from recorded payments. Overdue status is computed
              for today in Dallas.
            </p>
            {canWrite && (
              <Button asChild>
                <Link href="/invoices/new">New invoice</Link>
              </Button>
            )}
          </div>
          <section className="panel">
            {!rows.length && (
              <EmptyState
                title="No invoices yet"
                description="Create an invoice from an approved estimate or enter a reviewed scope manually."
                href={canWrite ? "/invoices/new" : "/jobs"}
                action={
                  canWrite ? "Create first invoice" : "View assigned jobs"
                }
              />
            )}
            {rows.map((r) => (
              <Link className="rowlink" href={`/invoices/${r.id}`} key={r.id}>
                <span>
                  {r.document.number} · {r.customer.name}
                </span>
                <span>
                  {r.status} · Balance {formatCents(r.balanceCents)}
                </span>
              </Link>
            ))}
          </section>
        </>
      );
    }
    if (id === "new") {
      office(a);
      const [customers, properties, jobs, approved, settings] =
        await Promise.all([
          domain.customers(a),
          domain.properties(a),
          domain.jobs(a),
          listEstimates(a),
          db.organizationSettings.findUniqueOrThrow({
            where: { organizationId: a.organizationId },
          }),
        ]);
      return (
        <>
          <h1>New invoice</h1>
          <InvoiceForm
            customers={customers}
            properties={properties}
            jobs={jobs}
            approved={approved
              .filter((e) => e.status === "APPROVED")
              .map((e) => ({
                id: e.id,
                number: e.document.number,
                customer: e.customer.name,
                totalCents: e.totalCents,
              }))}
            dueDate={defaultValidUntil(settings.invoiceNetDays)}
            settings={settings}
            sourceId={sourceId}
          />
        </>
      );
    }
    const r = await invoices.readInvoice(a, id);
    const snapshot = snapshotSchema.parse(r.document.versions[0].snapshot);
    return (
      <>
        <h1>{r.document.number}</h1>
        <p>
          {r.customer.name} · {r.status}
        </p>
        <section className="panel">
          <div className="grid">
            <div>
              Total<h2>{formatCents(r.totalCents)}</h2>
            </div>
            <div>
              Amount paid<h2>{formatCents(r.amountPaidCents)}</h2>
            </div>
            <div>
              Balance<h2>{formatCents(r.balanceCents)}</h2>
            </div>
          </div>
          <p>Due {r.dueDate?.toISOString().slice(0, 10) ?? "Not set"}</p>
          {r.sourceEstimateId && (
            <Link href={`/estimates/${r.sourceEstimateId}`}>
              Source approved estimate →
            </Link>
          )}
          {r.voidedAt && <p className="error">VOID: {r.voidReason}</p>}
          {snapshot.lines.map((l, i) => (
            <div className="rowlink" key={i}>
              <div>
                <strong>{l.title}</strong>
                <p>{l.description}</p>
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
        </section>
        {!r.issueDate && !r.voidedAt && canWrite && (
          <WorkflowButton
            endpoint={`/api/workflow/invoices/${id}/issue`}
            label="Issue invoice PDF"
            confirmText="Freeze this invoice and generate its PDF?"
          />
        )}
        {(r.issueDate || r.voidedAt) && (
          <DocumentActions
            documentId={r.documentId}
            canShare={canWrite && !r.voidedAt}
          />
        )}
        <InvoiceLedger
          id={id}
          payments={r.payments.map((p) => ({
            ...p,
            paidAt: p.paidAt.toISOString(),
            reversedAt: p.reversedAt?.toISOString() ?? null,
          }))}
          balance={r.balanceCents}
          canWrite={canWrite && !r.voidedAt}
          canPay={!!r.issueDate && !r.voidedAt}
          initialDate={timestamp()}
        />
        {!r.issueDate && !r.voidedAt && !r.sourceEstimateId && canWrite && (
          <details className="panel">
            <summary>Edit scratch invoice draft</summary>
            <InvoiceForm
              existing={{
                id: r.id,
                draft: {
                  customerId: r.customerId,
                  propertyId: r.propertyId,
                  jobId: r.jobId,
                  lineItems: snapshot.lines.map((l) => ({
                    serviceId: l.serviceId,
                    title: l.title,
                    description: l.description,
                    quantity: l.quantity,
                    unit: l.unit,
                    unitPriceCents: l.unitPriceCents,
                    discountCents: l.discountCents,
                    taxable: l.taxable,
                    note: l.note,
                  })),
                  discountCents: r.discountCents,
                  depositRequestCents: 0,
                  terms: snapshot.terms,
                  exclusions: snapshot.exclusions,
                  assumptions: snapshot.assumptions,
                  warrantyTerms: snapshot.warrantyTerms,
                  customerNote: snapshot.customerNote,
                  internalNote: "",
                  validUntil: null,
                  preferences: snapshot.preferences,
                },
                paymentInstructions: r.paymentInstructions ?? "",
                notes: r.notes ?? "",
              }}
              customers={await domain.customers(a)}
              properties={await domain.properties(a)}
              jobs={await domain.jobs(a)}
              approved={[]}
              dueDate={r.dueDate!.toISOString().slice(0, 10)}
              settings={await db.organizationSettings.findUniqueOrThrow({
                where: { organizationId: a.organizationId },
              })}
            />
          </details>
        )}
      </>
    );
  }
  if (kind === "receipts") {
    if (!id) {
      const rows = await invoices.listReceipts(a);
      return (
        <>
          <h1>Receipts</h1>
          {!rows.length && (
            <EmptyState
              title="No receipts yet"
              description="A receipt is created only after the office records money already received."
              href="/invoices"
              action="Open invoices"
            />
          )}
          <section className="panel">
            {!rows.length && (
              <p>Receipts appear only after a payment is recorded.</p>
            )}
            {rows.map((r) => (
              <Link className="rowlink" href={`/receipts/${r.id}`} key={r.id}>
                {r.document.number}
                <span>
                  {r.status} · {formatCents(r.payment.amountCents)}
                </span>
              </Link>
            ))}
          </section>
        </>
      );
    }
    const r = await invoices.readReceipt(a, id);
    return (
      <>
        <h1>{r.document.number}</h1>
        <section className="panel">
          <h2>{r.status}</h2>
          <p>
            Recorded payment: {formatCents(r.payment.amountCents)} ·{" "}
            {r.payment.method}
          </p>
          <p>
            Balance after payment:{" "}
            <strong>{formatCents(r.balanceAfterCents)}</strong>
          </p>
          {r.payment.reversedAt && (
            <p className="error">
              VOID — payment reversed: {r.payment.reversedReason}
            </p>
          )}
          <Link href={`/invoices/${r.invoiceId}`}>View invoice →</Link>
        </section>
        <DocumentActions
          documentId={r.documentId}
          canShare={canWrite && !r.payment.reversedAt}
        />
      </>
    );
  }
  if (kind === "inspections") {
    if (!id) {
      const rows = await inspections.listInspections(a);
      return (
        <>
          <h1>Inspections</h1>
          <Button asChild>
            <Link href="/inspections/new">New inspection</Link>
          </Button>
          <section className="panel">
            {!rows.length && (
              <EmptyState
                title="No inspections yet"
                description="Start a chimney or dryer-vent report for an assigned job."
                href="/inspections/new"
                action="Start first inspection"
              />
            )}
            {rows.map((r) => (
              <Link
                className="rowlink"
                href={`/inspections/${r.id}`}
                key={r.id}
              >
                {r.document.number} · {r.customer.name}
                <span>
                  {r.kind} · {r.status}
                </span>
              </Link>
            ))}
          </section>
        </>
      );
    }
    if (id === "new")
      return (
        <>
          <h1>New inspection</h1>
          <InspectionCreate
            jobs={await domain.jobs(a)}
            technicians={
              a.role === "TECHNICIAN" ? [] : await domain.technicians(a)
            }
            isTechnician={a.role === "TECHNICIAN"}
            initialDate={timestamp()}
          />
        </>
      );
    const r = await inspections.readInspection(a, id);
    const own = r.technicianId === a.id;
    const selection = await db.auditLog.findFirst({
      where: {
        organizationId: a.organizationId,
        entity: "Inspection",
        entityId: id,
        action: "REPAIRS_SELECTED",
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });
    const rawSelection = (selection?.after as { findingIds?: unknown } | null)
      ?.findingIds;
    const initialSelection = Array.isArray(rawSelection)
      ? rawSelection.filter(
          (v): v is string =>
            typeof v === "string" &&
            r.sections.some((s) =>
              s.findings.some((f) => f.id === v && f.status === "FAIL"),
            ),
        )
      : [];

    return (
      <>
        <h1>
          {r.kind === "CHIMNEY" ? "Chimney inspection" : "Dryer vent report"}
        </h1>
        <p>
          {r.customer.name} · {r.property.line1} · {r.technician.name}
        </p>
        <InspectionEditor
          key={r.updatedAt.toISOString()}
          row={r}
          userId={a.id}
          canEdit={r.status === "DRAFT" && (canWrite || own)}
          canSignoff={r.status === "DRAFT" && own}
          canFinalize={r.status === "TECH_SIGNED" && (canWrite || own)}
        />
        {r.finalizedAt && (
          <DocumentActions
            documentId={r.documentId}
            canShare={canWrite || own}
          />
        )}
        <InspectionRepairs
          key={`${id}:${r.updatedAt.toISOString()}`}
          initialSelection={initialSelection}
          selectedBy={selection?.user?.name}
          id={id}
          findings={r.sections
            .flatMap((s) => s.findings)
            .filter((f) => f.status === "FAIL")}
          canPrice={canWrite}
        />
      </>
    );
  }
  notFound();
}
