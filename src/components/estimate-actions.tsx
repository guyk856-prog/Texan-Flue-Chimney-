"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function EstimateActions({
  id,
  status,
  canEdit,
  issued,
}: {
  id: string;
  status: string;
  canEdit: boolean;
  issued: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const mark = () => setDirty(true);
    window.addEventListener("estimate-dirty", mark);
    return () => window.removeEventListener("estimate-dirty", mark);
  }, []);
  async function action(name: string, status?: string) {
    if (
      name === "issue" &&
      !window.confirm(
        "Issue and freeze this estimate? Further edits require a revision.",
      )
    )
      return;
    if (
      name === "status" &&
      !window.confirm(
        `Record ${status} manually? This does not send email or collect a signature.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/estimates/${id}/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(status ? { status } : {}),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else {
        if (name === "duplicate" || name === "revise")
          router.push(`/estimates/${d.id}`);
        router.refresh();
      }
    } catch {
      setError("Unable to complete action.");
    } finally {
      setBusy(false);
    }
  }
  const transitions: Record<string, string[]> = {
    READY: ["SENT", "EXPIRED"],
    SENT: ["VIEWED", "DECLINED", "EXPIRED"],
    VIEWED: ["APPROVED", "DECLINED", "EXPIRED"],
  };
  return (
    <>
      <div className="toolbar">
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            disabled={dirty}
            onClick={() =>
              window.open(`/api/estimates/${id}/preview`, "_blank", "noopener")
            }
          >
            Preview PDF
          </Button>
          {issued && (
            <Button
              variant="outline"
              onClick={async () => {
                const r = await fetch(`/api/estimates/${id}/download`);
                const d = await r.json();
                if (!r.ok) setError(d.error);
                else window.location.assign(d.url);
              }}
            >
              Download issued PDF
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                disabled={busy || dirty}
                variant="outline"
                onClick={() => action("duplicate")}
              >
                Duplicate
              </Button>
              {!issued ? (
                <Button
                  disabled={busy || dirty}
                  onClick={() => action("issue")}
                >
                  Issue estimate
                </Button>
              ) : (
                status !== "SUPERSEDED" && (
                  <Button
                    disabled={busy || dirty}
                    onClick={() => action("revise")}
                  >
                    Create revision
                  </Button>
                )
              )}
            </>
          )}
        </div>
      </div>
      {canEdit && issued && (
        <div className="panel">
          <p className="muted">
            Status records are manual in this phase. Marking sent does not
            deliver email; approval does not collect an electronic signature.
          </p>
          <div className="actions">
            {transitions[status]?.map((s) => (
              <Button
                key={s}
                disabled={busy || dirty}
                variant="outline"
                onClick={() => action("status", s)}
              >
                Record {s.toLowerCase()}
              </Button>
            ))}
          </div>
        </div>
      )}
      {dirty && (
        <p role="status" className="muted">
          Save draft changes before previewing, issuing or duplicating.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
