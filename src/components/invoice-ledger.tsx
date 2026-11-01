"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui/button";
import { formatCents } from "@/lib/money";
export function InvoiceLedger({
  id,
  payments,
  balance,
  canWrite,
  canPay,
  initialDate,
}: {
  id: string;
  payments: {
    id: string;
    amountCents: number;
    method: string;
    paidAt: string;
    reference: string | null;
    reversedAt: string | null;
    reversedReason: string | null;
    receipt: { id: string } | null;
  }[];
  balance: number;
  canWrite: boolean;
  canPay: boolean;
  initialDate: string;
}) {
  const timeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const now = new Date();
    if (timeRef.current)
      timeRef.current.value = new Date(
        now.getTime() - now.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16);
  }, [canPay, canWrite, balance]);
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <section className="panel">
        <h2>Payment records</h2>
        <p>
          These record money already received elsewhere. This application does
          not collect payments.
        </p>
        {!payments.length && (
          <p>
            No payment records. No receipt exists until a payment is recorded.
          </p>
        )}
        {payments.map((p) => (
          <div className="panel" key={p.id}>
            <strong>
              {formatCents(p.amountCents)} · {p.method}
            </strong>
            <p>
              {p.paidAt} · {p.reference || "No reference"}
            </p>
            {p.reversedAt && (
              <p className="error">REVERSED: {p.reversedReason}</p>
            )}
            {p.receipt && (
              <Link href={`/receipts/${p.receipt.id}`}>
                {p.reversedAt ? "View void receipt" : "View receipt"} →
              </Link>
            )}
            {canWrite && !p.reversedAt && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const reason = window.prompt(
                    "Reason for reversing this recorded payment (required)",
                  );
                  if (!reason?.trim()) return;
                  setBusy(true);
                  try {
                    const r = await fetch(
                      `/api/workflow/invoices/${id}/payments/${p.id}`,
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ reason }),
                      },
                    );
                    const d = await r.json();
                    if (r.ok) router.refresh();
                    else setError(d.error);
                  } catch {
                    setError("Unable to reverse payment.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reverse payment
              </Button>
            )}
          </div>
        ))}
      </section>
      {canWrite && canPay && balance > 0 && (
        <section className="panel">
          <h2>Record received payment</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch(`/api/workflow/invoices/${id}/payments`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    amountCents: Number(f.get("amountCents")),
                    method: f.get("method"),
                    paidAt: new Date(String(f.get("paidAt"))).toISOString(),
                    reference: f.get("reference"),
                    note: f.get("note"),
                    received: f.has("received"),
                  }),
                });
                const d = await r.json();
                if (r.ok) {
                  router.refresh();
                  router.push(`/receipts/${d.receipt.id}`);
                } else setError(d.error);
              } catch {
                setError("Unable to record payment.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="fields">
              <label>
                Amount (integer cents)
                <input
                  name="amountCents"
                  type="number"
                  required
                  min="1"
                  max={balance}
                  step="1"
                />
              </label>
              <label>
                Method
                <select name="method">
                  <option>CASH</option>
                  <option>CHECK</option>
                  <option>ZELLE</option>
                  <option>BANK_TRANSFER</option>
                  <option>OTHER</option>
                </select>
              </label>
              <label>
                Paid at (your local time)
                <input
                  ref={timeRef}
                  type="datetime-local"
                  required
                  name="paidAt"
                  defaultValue={initialDate}
                />
              </label>
              <label>
                Reference
                <input name="reference" maxLength={1000} />
              </label>
              <label>
                Note
                <textarea name="note" />
              </label>
            </div>
            <label>
              <input type="checkbox" name="received" required />I confirm this
              money has already been received elsewhere.
            </label>
            <Button disabled={busy}>Record payment and generate receipt</Button>
          </form>
        </section>
      )}
      {canWrite && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            const reason = window.prompt(
              "Void invoice reason (required). Reverse any payments first.",
            );
            if (!reason?.trim()) return;
            const r = await fetch(`/api/workflow/invoices/${id}/void`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason }),
            });
            const d = await r.json();
            if (r.ok) router.refresh();
            else setError(d.error);
          }}
        >
          Void invoice with reason
        </Button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
