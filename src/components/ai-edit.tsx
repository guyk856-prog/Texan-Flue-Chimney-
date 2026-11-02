"use client";
import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { TAX_CONFIRMATION } from "@/lib/estimate-contract";
export type Proposed = {
  lines: {
    title: string;
    description: string;
    quantity: string | null;
    unitPriceCents: number | null;
  }[];
  includeTax: boolean;
  includeFee: boolean;
};
export function AIEdit({
  id,
  resource = "extraction",
  current,
  onAccept,
}: {
  id: string;
  resource?: "extraction" | "estimate";
  current: Proposed;
  onAccept: (x: Proposed) => void;
}) {
  const [instruction, setInstruction] = useState(""),
    [proposal, setProposal] = useState<Proposed | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  return (
    <section className="panel">
      <h2>Propose an edit</h2>
      <label>
        Instruction (Hebrew or English)
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
      </label>
      <Button
        type="button"
        disabled={busy || !instruction.trim()}
        onClick={async () => {
          abort.current = new AbortController();
          setBusy(true);
          setError("");
          try {
            const r = await fetch(
              `/api/ai/${resource === "estimate" ? "estimates" : "extractions"}/${id}/edit`,
              {
                method: "POST",
                signal: abort.current.signal,
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ instruction, current }),
              },
            );
            const d = await r.json();
            if (r.ok) setProposal(d);
            else setError(d.error);
          } catch {
            setError("Cancelled or unavailable. Continue manually.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Preview proposed diff
      </Button>
      {busy && (
        <Button type="button" onClick={() => abort.current?.abort()}>
          Cancel AI request
        </Button>
      )}
      {proposal && (
        <>
          <div className="ai-diff">
            <div>
              <h3>Before</h3>
              <pre>{JSON.stringify(current, null, 2)}</pre>
            </div>
            <div>
              <h3>Proposed — not applied</h3>
              <pre>{JSON.stringify(proposal, null, 2)}</pre>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => {
              if (
                ((current.includeTax && !proposal.includeTax) ||
                  (current.includeFee && !proposal.includeFee)) &&
                !window.confirm(TAX_CONFIRMATION)
              )
                return;
              onAccept(proposal);
              setProposal(null);
            }}
          >
            Confirm proposed edits
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setProposal(null)}
          >
            Discard edits
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
