/* eslint-disable @next/next/no-img-element -- Evidence is a private session-bound signed URL. */
"use client";
import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { EstimateBuilder } from "./estimate-builder";
import type { Reviewed } from "@/lib/ai/contract";
import type { ComponentProps } from "react";
type Props = ComponentProps<typeof EstimateBuilder>;
export function AIReview(props: Props) {
  const [row, setRow] = useState<{
      id: string;
      payload: Reviewed;
      sourceFileId?: string;
      sourceType?: string;
    } | null>(null),
    [src, setSrc] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  return (
    <>
      <h1>AI estimate review</h1>
      <p>
        No estimate is created until you review, complete and approve the form.
        Uploaded content cannot approve or issue a document.
      </p>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          abort.current = new AbortController();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/ai/extract", {
              method: "POST",
              signal: abort.current.signal,
              body: data,
            });
            const d = await r.json();
            if (!r.ok) {
              setError(d.error);
              return;
            }
            const read = await fetch(`/api/ai/extractions/${d.id}`);
            const full = await read.json();
            setSrc("");
            setRow({
              ...d,
              sourceFileId: full.request.sourceFileId,
              sourceType: (data.get("file") as File | null)?.type,
            });
            if (full.request.sourceFileId) {
              setSrc(`/api/ai/extractions/${d.id}/source`);
            }
          } catch {
            setError(
              "Cancelled or unavailable. Continue with a manual estimate.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Input mode
          <select name="mode">
            <option value="DOCUMENT">Screenshot or PDF</option>
            <option value="PHOTO">Photograph with job notes</option>
            <option value="TEXT">Pasted Hebrew or English notes</option>
          </select>
        </label>
        <label>
          Source evidence
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
          />
        </label>
        <label>
          Owner instruction / job notes (Hebrew or English)
          <textarea name="instruction" required maxLength={10000} dir="auto" />
        </label>
        <Button disabled={busy}>Extract for review</Button>
        {busy && (
          <Button
            type="button"
            variant="outline"
            onClick={() => abort.current?.abort()}
          >
            Cancel extraction
          </Button>
        )}
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {row && (
        <div className="ai-review-grid">
          <aside className="ai-source panel">
            <h2>Original source evidence</h2>
            {src ? (
              <>
                <a href={src} target="_blank" rel="noreferrer">
                  Download private original
                </a>
                {row.sourceType === "application/pdf" ? (
                  <object
                    data={src}
                    type="application/pdf"
                    aria-label="Original uploaded PDF"
                  >
                    <a href={src}>Open private PDF evidence</a>
                  </object>
                ) : (
                  <img src={src} alt="Original source evidence" />
                )}
              </>
            ) : (
              <p>No uploaded file; review the owner’s pasted notes above.</p>
            )}
            <h3>Read from source</h3>
            <p>Customer: {row.payload.customer_name ?? "Unknown"}</p>
            <p>Contact: {row.payload.customer_contact ?? "Unknown"}</p>
            <p>Address: {row.payload.service_address ?? "Unknown"}</p>
            <p>
              Printed tax: {row.payload.tax ?? "Unknown"} cents · Printed fee:{" "}
              {row.payload.fees ?? "Unknown"} cents
            </p>
            <h3>Warnings and unknown fields</h3>
            {[...row.payload.warnings, ...row.payload.unknown_fields].map(
              (w, i) => (
                <p className="uncertain" key={i}>
                  {w}
                </p>
              ),
            )}
            {row.payload.line_items.map((l, i) => (
              <section
                className={
                  l.confidence < 85 ||
                  l.unit_price_cents === null ||
                  l.quantity === null
                    ? "panel uncertain"
                    : "panel"
                }
                key={i}
              >
                <strong>
                  Line {i + 1} · Confidence {l.confidence}/100
                </strong>
                <p>{l.name ?? "Unknown title"}</p>
                <blockquote>
                  {l.source_evidence || "No readable evidence"}
                </blockquote>
                <p>Read: {l.description ?? "Unknown"}</p>
                <p>
                  Generated English suggestion:{" "}
                  {l.generated_description ?? "None"}
                </p>
              </section>
            ))}
          </aside>
          <div>
            <EstimateBuilder
              {...props}
              key={row.id}
              review={{
                id: row.id,
                unknownPrices: row.payload.line_items.flatMap((l, i) =>
                  l.unit_price_cents === null ? [i] : [],
                ),
                unknownQuantities: row.payload.line_items.flatMap((l, i) =>
                  l.quantity === null ? [i] : [],
                ),
                removeTax: row.payload.proposed_actions.includes("REMOVE_TAX"),
                removeFee: row.payload.proposed_actions.includes("REMOVE_FEE"),
              }}
              initial={{
                ...props.initial,
                lineItems: row.payload.line_items.map((l) => ({
                  title: l.name ?? "",
                  description: l.generated_description ?? l.description ?? "",
                  quantity: l.quantity ?? "",
                  unit: l.unit ?? "",
                  unitPriceCents: l.unit_price_cents ?? 0,
                  discountCents: 0,
                  taxable: false,
                  note: "",
                })),
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
