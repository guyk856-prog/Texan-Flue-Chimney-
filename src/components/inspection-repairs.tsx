"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function InspectionRepairs({
  id,
  findings,
  canPrice,
  initialSelection = [],
  selectedBy,
}: {
  id: string;
  findings: {
    id: string;
    title: string;
    observation: string | null;
    recommendation: string | null;
  }[];
  canPrice: boolean;
  initialSelection?: string[];
  selectedBy?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initialSelection);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!findings.length) return null;
  return (
    <section className="panel">
      <h2>Selected repairs for an estimate</h2>
      {selectedBy && (
        <p className="muted">
          Last recorded selection by {selectedBy}. Prices must still be entered
          explicitly by an office user.
        </p>
      )}
      <p>
        Only FAIL findings can be selected. Nothing is added automatically, and
        no price is suggested.
      </p>
      {findings.map((f) => (
        <div className="panel" key={f.id}>
          <label>
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, f.id]
                    : old.filter((id) => id !== f.id),
                )
              }
            />
            {f.title}
          </label>
          <p>
            {f.observation} {f.recommendation}
          </p>
          {canPrice && selected.includes(f.id) && (
            <label>
              Explicit price (integer cents)
              <input
                type="number"
                min="0"
                step="1"
                value={prices[f.id] ?? ""}
                onChange={(e) =>
                  setPrices({ ...prices, [f.id]: e.target.value })
                }
              />
            </label>
          )}
        </div>
      ))}
      <div className="actions">
        <Button
          variant="outline"
          disabled={!selected.length}
          onClick={async () => {
            const r = await fetch(`/api/workflow/inspections/${id}/repairs`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ findingIds: selected }),
            });
            const d = await r.json();
            if (r.ok)
              setMessage(
                "Selected repairs recorded for office review. No estimate or price was created.",
              );
            else setError(d.error);
          }}
        >
          Record selected repairs
        </Button>
        {canPrice && (
          <Button
            disabled={
              !selected.length ||
              selected.some((id) => !/^\d+$/.test(prices[id] ?? ""))
            }
            onClick={async () => {
              const r = await fetch(`/api/workflow/inspections/${id}/repairs`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  findingIds: selected,
                  prices: selected.map((findingId) => ({
                    findingId,
                    unitPriceCents: Number(prices[findingId]),
                  })),
                }),
              });
              const d = await r.json();
              if (r.ok) {
                router.push(`/estimates/${d.id}`);
                router.refresh();
              } else setError(d.error);
            }}
          >
            Create priced estimate draft
          </Button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
