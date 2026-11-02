"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { formatCents, documentTotals } from "@/lib/money";
import { TAX_CONFIRMATION, type EstimateInput } from "@/lib/estimate-contract";
type EditableLine = Omit<
  EstimateInput["lineItems"][number],
  "unitPriceCents"
> & { unitPriceCents: number | undefined };
export function InvoiceForm({
  customers,
  properties,
  jobs,
  approved,
  dueDate,
  settings,
  sourceId = "",
  existing,
}: {
  customers: { id: string; name: string }[];
  properties: { id: string; customerId: string; line1: string }[];
  jobs: { id: string; customerId: string; propertyId: string; title: string }[];
  approved: {
    id: string;
    number: string;
    customer: string;
    totalCents: number;
  }[];
  dueDate: string;
  settings: {
    taxEnabled: boolean;
    feeEnabled: boolean;
    taxRateBasisPoints: number;
    feeRateBasisPoints: number;
  };
  sourceId?: string;
  existing?: {
    id: string;
    draft: EstimateInput;
    paymentInstructions: string;
    notes: string;
  };
}) {
  const router = useRouter();
  const [mode, setMode] = useState(sourceId ? "approved" : "scratch");
  const [source, setSource] = useState(sourceId);
  const [customer, setCustomer] = useState(existing?.draft.customerId ?? "");
  const [property, setProperty] = useState(existing?.draft.propertyId ?? "");
  const [lines, setLines] = useState<EditableLine[]>(
    existing?.draft.lineItems ?? [
      {
        title: "",
        description: "",
        quantity: "1",
        unit: "each",
        unitPriceCents: undefined,
        discountCents: 0,
        taxable: false,
        note: "",
      },
    ],
  );
  const [prefs, setPrefs] = useState(
    existing?.draft.preferences ?? {
      includeTax: true,
      includeFee: true,
      removalConfirmed: false,
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [discount, setDiscount] = useState(existing?.draft.discountCents ?? 0);
  let totals;
  try {
    totals = documentTotals(
      lines.map((l) => {
        if (l.unitPriceCents === undefined)
          throw new Error("Enter each price explicitly.");
        return { ...l, unitPriceCents: l.unitPriceCents };
      }),
      {
        ...settings,
        taxEnabled: settings.taxEnabled && prefs.includeTax,
        feeEnabled: settings.feeEnabled && prefs.includeFee,
        discountCents: discount,
        depositRequestCents: 0,
      },
    );
  } catch {}
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        const draft = {
          customerId: customer,
          propertyId: property,
          jobId: f.get("jobId") || null,
          lineItems: lines,
          terms: f.get("terms") ?? "",
          exclusions: f.get("exclusions") ?? "",
          assumptions: f.get("assumptions") ?? "",
          discountCents: discount,
          preferences: prefs,
        };
        try {
          const r = await fetch(
            existing
              ? `/api/workflow/invoices/${existing.id}`
              : "/api/workflow/invoices",
            {
              method: existing ? "PATCH" : "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                ...(mode === "approved"
                  ? { sourceEstimateId: source }
                  : { draft }),
                dueDate: f.get("dueDate"),
                paymentInstructions: f.get("paymentInstructions"),
                notes: f.get("notes"),
              }),
            },
          );
          const d = await r.json();
          if (r.ok) {
            router.push(`/invoices/${d.id}`);
            router.refresh();
          } else setError(d.error);
        } catch {
          setError(
            "The invoice was not saved. Your entries remain here. Check your connection and retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="panel">
        <h2>Invoice source</h2>
        {!existing && (
          <label>
            Create from
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="scratch">Scratch</option>
              <option value="approved">
                Approved estimate — preserve approved amounts
              </option>
            </select>
          </label>
        )}
        {mode === "approved" ? (
          <>
            <label>
              Approved estimate
              <select
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">Select…</option>
                {approved.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.number} · {e.customer} · {formatCents(e.totalCents)}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Conversion copies the approved snapshot. Current catalog prices
              and tax settings do not re-price it.
            </p>
          </>
        ) : (
          <>
            <div className="fields">
              <label>
                Customer
                <select
                  required
                  value={customer}
                  onChange={(e) => {
                    setCustomer(e.target.value);
                    setProperty("");
                  }}
                >
                  <option value="">Select…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Property
                <select
                  required
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                >
                  <option value="">Select…</option>
                  {properties
                    .filter((p) => p.customerId === customer)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.line1}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Job (optional)
                <select name="jobId" defaultValue={existing?.draft.jobId ?? ""}>
                  <option value="">None</option>
                  {jobs
                    .filter(
                      (j) =>
                        j.customerId === customer && j.propertyId === property,
                    )
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {lines.map((l, i) => (
              <fieldset className="panel" key={i}>
                <legend>Line {i + 1}</legend>
                <div className="fields">
                  <label>
                    Title
                    <input
                      required
                      value={l.title}
                      onChange={(e) =>
                        setLines(
                          lines.map((old, j) =>
                            j === i ? { ...old, title: e.target.value } : old,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Quantity
                    <input
                      required
                      value={l.quantity}
                      onChange={(e) =>
                        setLines(
                          lines.map((old, j) =>
                            j === i
                              ? { ...old, quantity: e.target.value }
                              : old,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Unit price (integer cents)
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={l.unitPriceCents ?? ""}
                      onChange={(e) =>
                        setLines(
                          lines.map((old, j) =>
                            j === i
                              ? {
                                  ...old,
                                  unitPriceCents:
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                }
                              : old,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Line discount (integer cents)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={l.discountCents}
                      onChange={(e) =>
                        setLines(
                          lines.map((old, j) =>
                            j === i
                              ? {
                                  ...old,
                                  discountCents: Number(e.target.value),
                                }
                              : old,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Taxable
                    <input
                      type="checkbox"
                      checked={l.taxable}
                      onChange={(e) =>
                        setLines(
                          lines.map((old, j) =>
                            j === i
                              ? { ...old, taxable: e.target.checked }
                              : old,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    value={l.description}
                    onChange={(e) =>
                      setLines(
                        lines.map((old, j) =>
                          j === i
                            ? { ...old, description: e.target.value }
                            : old,
                        ),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  Remove line
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setLines([
                  ...lines,
                  {
                    title: "",
                    description: "",
                    quantity: "1",
                    unit: "each",
                    unitPriceCents: undefined,
                    discountCents: 0,
                    taxable: false,
                    note: "",
                  },
                ])
              }
            >
              Add line
            </Button>
            <label>
              Document discount (integer cents)
              <input
                type="number"
                min="0"
                step="1"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </label>
            {(["includeTax", "includeFee"] as const).map((key, i) => (
              <label key={key}>
                {i === 0 ? "Tax" : "Service fee"}
                {(i === 0 ? settings.taxEnabled : settings.feeEnabled) ? (
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={(e) => {
                      if (
                        !e.target.checked &&
                        !window.confirm(TAX_CONFIRMATION)
                      )
                        return;
                      setPrefs({
                        ...prefs,
                        [key]: e.target.checked,
                        removalConfirmed:
                          !e.target.checked || prefs.removalConfirmed,
                      });
                    }}
                  />
                ) : (
                  <span>Disabled in company settings.</span>
                )}
              </label>
            ))}
            {(!prefs.includeTax || !prefs.includeFee) && (
              <p>{TAX_CONFIRMATION}</p>
            )}
            <p>
              Calculated total:{" "}
              {totals ? formatCents(totals.totalCents) : "Check amounts"}
            </p>
            <div className="fields">
              <label>
                Terms
                <textarea
                  name="terms"
                  defaultValue={existing?.draft.terms ?? ""}
                />
              </label>
              <label>
                Exclusions
                <textarea
                  name="exclusions"
                  defaultValue={existing?.draft.exclusions ?? ""}
                />
              </label>
              <label>
                Assumptions
                <textarea
                  name="assumptions"
                  defaultValue={existing?.draft.assumptions ?? ""}
                />
              </label>
            </div>
          </>
        )}
      </section>
      <section className="panel">
        <div className="fields">
          <label>
            Due date
            <input name="dueDate" type="date" required defaultValue={dueDate} />
          </label>
          <label>
            Payment instructions
            <textarea
              name="paymentInstructions"
              defaultValue={existing?.paymentInstructions ?? ""}
            />
          </label>
          <label>
            Internal invoice note
            <textarea name="notes" defaultValue={existing?.notes ?? ""} />
          </label>
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button disabled={busy || (mode === "scratch" && !lines.length)}>
        {busy ? "Saving…" : "Save invoice draft"}
      </Button>
    </form>
  );
}
