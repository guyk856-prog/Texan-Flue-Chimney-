"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export function ChecklistEditor({
  kind,
  initial,
}: {
  kind: "CHIMNEY" | "DRYER_VENT";
  initial: { key: string; title: string }[];
}) {
  const [rows, setRows] = useState(initial);
  const [message, setMessage] = useState("");
  return (
    <section className="panel">
      <h2>{kind === "CHIMNEY" ? "Chimney" : "Dryer vent"} checklist</h2>
      <p>
        New inspections use the latest checklist version. Existing inspections
        and issued reports do not change.
      </p>
      {rows.map((row, i) => (
        <div className="panel" key={i}>
          <div className="fields">
            <label>
              Key
              <input
                value={row.key}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      j === i ? { ...r, key: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <label>
              Title
              <input
                value={row.title}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      j === i ? { ...r, title: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
          </div>
          <div className="actions">
            <Button
              variant="outline"
              disabled={!i}
              onClick={() => {
                const copy = [...rows];
                [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                setRows(copy);
              }}
            >
              Move up
            </Button>
            <Button
              variant="outline"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <div className="actions">
        <Button
          variant="outline"
          onClick={() =>
            setRows([...rows, { key: `custom_${rows.length + 1}`, title: "" }])
          }
        >
          Add checklist item
        </Button>
        <Button
          onClick={async () => {
            try {
              const r = await fetch("/api/workflow/inspections/templates", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind, checklist: rows }),
              });
              const d = await r.json();
              setMessage(
                r.ok ? `Saved checklist version ${d.version}.` : d.error,
              );
            } catch {
              setMessage("Unable to save.");
            }
          }}
        >
          Save checklist version
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
