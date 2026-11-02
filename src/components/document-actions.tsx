"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function DocumentActions({
  documentId,
  canShare = true,
}: {
  documentId: string;
  canShare?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [links, setLinks] = useState<
    {
      id: string;
      version: number;
      viewCount: number;
      revokedAt: string | null;
    }[]
  >([]);
  async function history() {
    const r = await fetch(`/api/workflow/documents/${documentId}/shares`);
    const d = await r.json();
    if (r.ok) setLinks(d);
    else setError(d.error);
  }
  return (
    <section className="panel">
      <div className="actions">
        <Button
          variant="outline"
          onClick={async () => {
            const r = await fetch(`/api/workflow/documents/${documentId}/pdf`);
            const d = await r.json();
            if (r.ok) window.location.assign(d.url);
            else setError(d.error);
          }}
        >
          Download PDF
        </Button>
        {canShare && (
          <Button
            variant="outline"
            onClick={async () => {
              const r = await fetch(
                `/api/workflow/documents/${documentId}/share`,
                { method: "POST" },
              );
              const d = await r.json();
              if (r.ok) {
                setLink(d.url);
                history();
                router.refresh();
              } else setError(d.error);
            }}
          >
            Create customer share link
          </Button>
        )}
        <Button variant="outline" onClick={history}>
          Share link activity
        </Button>
      </div>
      {link && (
        <div className="success">
          <p>
            Copy and deliver this link to the customer yourself. No email or SMS
            is sent.
          </p>
          <input aria-label="Customer share link" readOnly value={link} />
          <a href={link} target="_blank" rel="noreferrer">
            Open customer view →
          </a>
        </div>
      )}
      {links.map((l) => (
        <div className="rowlink" key={l.id}>
          <span>
            Version {l.version} · {l.viewCount} views ·{" "}
            {l.revokedAt ? "Revoked" : "Active / expiry applies"}
          </span>
          {!l.revokedAt && (
            <Button
              variant="outline"
              onClick={async () => {
                const r = await fetch(
                  `/api/workflow/documents/${documentId}/shares/${l.id}`,
                  { method: "DELETE" },
                );
                const d = await r.json();
                if (r.ok) history();
                else setError(d.error);
              }}
            >
              Revoke link
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function WorkflowButton({
  endpoint,
  label,
  confirmText,
}: {
  endpoint: string;
  label: string;
  confirmText?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          try {
            const r = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ confirmed: true }),
            });
            const d = await r.json();
            if (!r.ok) setError(d.error);
            else router.refresh();
          } catch {
            setError(
              "This action did not finish. Your entries remain here. Check your connection and retry.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
