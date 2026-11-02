"use client";
import Link from "next/link";

import { useState } from "react";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";
export function CustomerPrivacy({ id }: { id: string }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <section className="panel">
      <h2>Customer records and privacy</h2>
      <p>
        Exports include the customer’s records and attached evidence. Verify the
        requester before sharing. Archiving revokes active links and hides
        service access; issued records follow the retention procedure.
      </p>
      <a className="empty-action" href={`/api/privacy/customers/${id}/export`}>
        Download customer records ZIP
      </a>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          const reason = window.prompt(
            "Reason and request reference for archiving this customer (required)",
          );
          if (!reason?.trim()) return;
          setBusy(true);
          try {
            const r = await fetch(`/api/privacy/customers/${id}/archive`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason }),
            });
            const d = await r.json();
            if (r.ok) {
              router.push("/customers");
              router.refresh();
            } else setMessage(d.error);
          } catch {
            setMessage(
              "Could not archive. Check your connection and try again; no local form entries were cleared.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Archive for a privacy request
      </Button>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      <p>
        <Link href="/legal/privacy">Read the draft Privacy Policy</Link>
      </p>
    </section>
  );
}
