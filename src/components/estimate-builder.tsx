"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { documentTotals, formatCents } from "@/lib/money";
import { TAX_CONFIRMATION, type EstimateInput } from "@/lib/estimate-contract";
type Service = {
  id: string;
  title: string;
  description: string;
  unit: string;
  companyDefinedTerm: boolean;
  scopeSteps: string[];
  price: number | null;
};
type EditableLine = {
  serviceId: string | null;
  title: string;
  description: string;
  quantity: string;
  unit: string;
  unitPriceCents: string;
  discountCents: string;
  taxable: boolean;
  note: string;
};
export function EstimateBuilder({
  initial,
  id,
  customers,
  properties,
  jobs,
  services,
  settings,
}: {
  initial: EstimateInput;
  id?: string;
  customers: { id: string; name: string }[];
  properties: { id: string; customerId: string; line1: string }[];
  jobs: { id: string; customerId: string; propertyId: string; title: string }[];
  services: Service[];
  settings: {
    taxEnabled: boolean;
    feeEnabled: boolean;
    taxRateBasisPoints: number;
    feeRateBasisPoints: number;
    taxLabel: string;
    feeLabel: string;
  };
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [lines, setLines] = useState<EditableLine[]>(
    initial.lineItems.map((l) => ({
      ...l,
      serviceId: l.serviceId ?? null,
      unitPriceCents: String(l.unitPriceCents),
      discountCents: String(l.discountCents),
    })),
  );
  const [discount, setDiscount] = useState(String(initial.discountCents));
  const [deposit, setDeposit] = useState(String(initial.depositRequestCents));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const integer = (v: string) => {
    if (!/^\d+$/.test(v))
      throw new Error("Enter amounts in whole integer cents.");
    const n = Number(v);
    if (!Number.isSafeInteger(n)) throw new Error("Amount is too large.");
    return n;
  };
  const prepared = () => ({
    ...data,
    discountCents: integer(discount),
    depositRequestCents: integer(deposit),
    lineItems: lines.map((l) => ({
      ...l,
      unitPriceCents: integer(l.unitPriceCents),
      discountCents: integer(l.discountCents),
    })),
  });
  let totals: ReturnType<typeof documentTotals> | undefined;
  let moneyError = "";
  try {
    const input = prepared();
    totals = documentTotals(input.lineItems, {
      ...input,
      ...settings,
      taxEnabled: settings.taxEnabled && data.preferences.includeTax,
      feeEnabled: settings.feeEnabled && data.preferences.includeFee,
    });
  } catch (e) {
    moneyError = e instanceof Error ? e.message : "Check amounts.";
  }
  const updateLine = (
    i: number,
    key: keyof EditableLine,
    value: string | boolean,
  ) =>
    setLines((old) =>
      old.map((l, j) => (j === i ? { ...l, [key]: value } : l)),
    );
  const add = (service?: Service) => {
    window.dispatchEvent(new Event("estimate-dirty"));
    return setLines((old) => [
      ...old,
      {
        serviceId: service?.id ?? null,
        title: service?.title ?? "",
        description: service?.description ?? "",
        quantity: "1",
        unit: service?.unit ?? "each",
        unitPriceCents:
          service?.price === null || !service ? "" : String(service.price),
        discountCents: "0",
        taxable: false,
        note: "",
      },
    ]);
  };
  function toggle(key: "includeTax" | "includeFee", value: boolean) {
    if (!value && !window.confirm(TAX_CONFIRMATION)) return;
    setData({
      ...data,
      preferences: {
        ...data.preferences,
        [key]: value,
        removalConfirmed: !value || data.preferences.removalConfirmed,
      },
    });
  }
  return (
    <form
      onChange={() => window.dispatchEvent(new Event("estimate-dirty"))}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          const input = prepared();
          const response = await fetch(
            id ? `/api/estimates/${id}` : "/api/estimates",
            {
              method: id ? "PATCH" : "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            },
          );
          const result = await response.json();
          if (!response.ok) setError(result.error);
          else {
            router.push(`/estimates/${result.id}`);
            router.refresh();
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="panel">
        <h2>Customer and service property</h2>
        <div className="fields">
          <label>
            Customer
            <select
              required
              value={data.customerId}
              onChange={(e) =>
                setData({
                  ...data,
                  customerId: e.target.value,
                  propertyId: "",
                  jobId: null,
                })
              }
            >
              <option value="">Select customer…</option>
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
              value={data.propertyId}
              onChange={(e) =>
                setData({ ...data, propertyId: e.target.value, jobId: null })
              }
            >
              <option value="">Select property…</option>
              {properties
                .filter((p) => p.customerId === data.customerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.line1}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Related job (optional)
            <select
              value={data.jobId ?? ""}
              onChange={(e) =>
                setData({ ...data, jobId: e.target.value || null })
              }
            >
              <option value="">No job</option>
              {jobs
                .filter(
                  (j) =>
                    j.customerId === data.customerId &&
                    j.propertyId === data.propertyId,
                )
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Valid until
            <input
              type="date"
              required
              value={data.validUntil ?? ""}
              onChange={(e) =>
                setData({ ...data, validUntil: e.target.value || null })
              }
            />
          </label>
        </div>
      </section>
      <section className="panel">
        <h2>Line items</h2>
        <div className="toolbar">
          <label>
            Service library
            <select
              defaultValue=""
              onChange={(e) => {
                const s = services.find((s) => s.id === e.target.value);
                if (s) add(s);
                e.target.value = "";
              }}
            >
              <option value="">Add a catalog service…</option>
              {services.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title}
                  {s.price === null ? " — enter price" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" onClick={() => add()}>
            Add custom line
          </Button>
        </div>
        {!lines.length && <p>Add a service or a custom line to begin.</p>}
        {lines.map((line, i) => {
          const service = services.find((s) => s.id === line.serviceId);
          return (
            <fieldset className="panel" key={i}>
              <legend>Line {i + 1}</legend>
              <div className="fields">
                <label>
                  Service title
                  <input
                    required
                    value={line.title}
                    readOnly={service?.companyDefinedTerm}
                    onChange={(e) => updateLine(i, "title", e.target.value)}
                  />
                </label>
                <label>
                  Quantity
                  <input
                    required
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, "quantity", e.target.value)}
                  />
                </label>
                <label>
                  Unit
                  <input
                    required
                    value={line.unit}
                    onChange={(e) => updateLine(i, "unit", e.target.value)}
                  />
                </label>
                <label>
                  Unit price (integer cents)
                  <input
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    required
                    value={line.unitPriceCents}
                    onChange={(e) =>
                      updateLine(i, "unitPriceCents", e.target.value)
                    }
                  />
                </label>
                <label>
                  Line discount (integer cents)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={line.discountCents}
                    onChange={(e) =>
                      updateLine(i, "discountCents", e.target.value)
                    }
                  />
                </label>
                <label>
                  Taxable
                  <input
                    type="checkbox"
                    checked={line.taxable}
                    onChange={(e) => updateLine(i, "taxable", e.target.checked)}
                  />
                </label>
              </div>
              <label>
                Description / scope
                <textarea
                  value={line.description}
                  maxLength={20000}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                />
              </label>
              {service?.companyDefinedTerm && (
                <div className="success">
                  <strong>
                    Company-defined cleaning term; not an NFPA inspection level.
                  </strong>
                  <ul>
                    {service.scopeSteps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label>
                Line note
                <textarea
                  value={line.note}
                  onChange={(e) => updateLine(i, "note", e.target.value)}
                />
              </label>
              <div className="toolbar">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new Event("estimate-dirty"));
                    setLines((old) => old.filter((_, j) => j !== i));
                  }}
                >
                  Remove line {i + 1}
                </Button>
              </div>
            </fieldset>
          );
        })}
      </section>
      <section className="panel">
        <h2>Totals</h2>
        <div className="fields">
          <label>
            Document discount (integer cents)
            <input
              type="number"
              min="0"
              step="1"
              required
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label>
            Deposit requested (integer cents)
            <input
              type="number"
              min="0"
              step="1"
              required
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </label>
          <label>
            {settings.taxLabel}
            {settings.taxEnabled ? (
              <input
                type="checkbox"
                checked={data.preferences.includeTax}
                onChange={(e) => toggle("includeTax", e.target.checked)}
              />
            ) : (
              <span className="muted">
                Disabled in company settings; not included.
              </span>
            )}
          </label>
          <label>
            {settings.feeLabel}
            {settings.feeEnabled ? (
              <input
                type="checkbox"
                checked={data.preferences.includeFee}
                onChange={(e) => toggle("includeFee", e.target.checked)}
              />
            ) : (
              <span className="muted">
                Disabled in company settings; not included.
              </span>
            )}
          </label>
        </div>
        {(!data.preferences.includeTax || !data.preferences.includeFee) && (
          <p className="error">{TAX_CONFIRMATION}</p>
        )}
        {totals ? (
          <div className="grid">
            {Object.entries(totals).map(([key, value]) => (
              <div key={key}>
                <span className="muted">
                  {key.replace(/Cents$/, " ").replace(/([A-Z])/g, " $1")}
                </span>
                <p>
                  <strong>{formatCents(value)}</strong>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p role="status" className="muted">
            {moneyError}
          </p>
        )}
        <p className="muted">
          Live preview. The server recalculates all amounts on save.
        </p>
      </section>
      <section className="panel">
        <h2>Terms and notes</h2>
        <div className="fields">
          {(
            [
              "terms",
              "exclusions",
              "assumptions",
              "warrantyTerms",
              "customerNote",
              "internalNote",
            ] as const
          ).map((key) => (
            <label key={key}>
              {key.replace(/([A-Z])/g, " $1")}
              <textarea
                value={data[key]}
                maxLength={20000}
                onChange={(e) => setData({ ...data, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p className="muted">
          Internal notes are never included in the PDF snapshot.
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy || !lines.length || !!moneyError}>
        {busy ? "Saving…" : "Save draft"}
      </Button>
    </form>
  );
}
