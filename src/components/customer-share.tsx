"use client";
import { useState } from "react";
import { EstimateDocument } from "@/pdf/document";
import type { EstimateSnapshot } from "@/lib/snapshot";
import { Button } from "./ui/button";
export function CustomerShare({
  token,
  snapshot,
  canSign,
  consentText,
  consentVersion,
}: {
  token: string;
  snapshot: EstimateSnapshot;
  canSign: boolean;
  consentText: string;
  consentVersion: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    signedUrl?: string;
    certificateUrl?: string;
    declined?: boolean;
  } | null>(null);
  async function submit(form: HTMLFormElement, action: string) {
    setError("");
    setBusy(true);
    const f = new FormData(form);
    try {
      const r = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          name: f.get("name"),
          email: f.get("email") ?? "",
          phone: f.get("phone") ?? "",
          typedName: f.get("typedName") ?? "",
          consent: f.has("consent"),
          consentVersion,
          reason: f.get("reason") ?? "",
        }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else setResult(d);
    } catch {
      setError("Unable to submit. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 1000, margin: "auto" }}>
      <div className="eyebrow">Texan Flue Chimney · Customer document</div>
      <p>
        Review the exact document version below. No account or login is needed.
      </p>
      <style>{`.share-document table{width:100%;border-collapse:collapse}.share-document th,.share-document td{padding:12px 8px;border-bottom:1px solid #DDD8CE;text-align:left}.share-document .parties{display:flex;gap:32px}.share-document .parties>div{flex:1}.share-document .wordmark{font-family:Georgia,serif;font-size:28px;color:#8A6827}.share-document .finding-status{display:block;font-weight:bold;padding:12px;border:2px solid #8A6827}.share-document .FAIL{color:#9B2C2C}.share-document .NOT_INSPECTED{background:#F6F4F0}.share-document .finding{padding:12px;margin-bottom:16px;border:1px solid #DDD8CE}.share-document figure{margin:0}.share-document img{max-width:100%;max-height:360px}.share-document .photo-grid{display:grid;gap:16px}.share-document .signature{margin-top:24px;border-top:1px solid #DDD8CE;padding:16px}.share-document .totals{margin:24px 0 24px auto;max-width:400px}.share-document .totals>div{display:flex;justify-content:space-between;padding:6px}.share-document .grand{font-size:22px;border-top:1px solid #C5A15B}.share-document .rich{white-space:pre-wrap;margin:20px 0}.share-document small{overflow-wrap:anywhere}.share-document .title{margin:20px 0}.share-document .title>div{color:#6F6A63}@media(max-width:600px){.share-document{overflow-x:auto}.share-document .parties{display:block}.share-document .photo-grid{grid-template-columns:1fr!important}}`}</style>
      <section className="panel share-document">
        <EstimateDocument snapshot={snapshot} />
        <p className="muted">{snapshot.disclaimer}</p>
      </section>
      {!result && (
        <p>
          <a href={`/api/share/${token}/pdf`}>
            Download this exact PDF version
          </a>
        </p>
      )}
      {result ? (
        <section className="panel">
          <h1>
            {result.declined ? "Response recorded" : "Signature recorded"}
          </h1>
          {result.signedUrl && (
            <>
              <p>
                <a href={result.signedUrl}>Open your signed document</a>
              </p>
              <p>
                <a
                  href={
                    result.signedUrl.replace("/share/", "/api/share/") + "/pdf"
                  }
                >
                  Download signed PDF
                </a>
              </p>
            </>
          )}
          {result.certificateUrl && (
            <p>
              <a
                href={
                  result.certificateUrl.replace("/share/", "/api/share/") +
                  "/pdf"
                }
              >
                Download approval certificate
              </a>
            </p>
          )}
          <p>
            The original signing link is now closed. Retain your signed-document
            link and PDF.
          </p>
        </section>
      ) : (
        canSign && (
          <section className="panel">
            <h1>
              {snapshot.document.type === "ESTIMATE"
                ? "Review and approve"
                : "Acknowledge this report"}
            </h1>
            <form
              onChange={() => setError("")}
              onSubmit={(e) => {
                e.preventDefault();
                submit(e.currentTarget, "APPROVE");
              }}
            >
              <div className="fields">
                <label>
                  Your name
                  <input name="name" required maxLength={200} />
                </label>
                <label>
                  Email (optional)
                  <input name="email" type="email" maxLength={254} />
                </label>
                <label>
                  Phone (optional)
                  <input name="phone" maxLength={60} />
                </label>
                <label>
                  Type your name as your signature
                  <input name="typedName" maxLength={200} />
                </label>
              </div>
              <p>{consentText}</p>
              <label>
                <input name="consent" type="checkbox" />I affirm the
                electronic-signature consent above.
              </label>
              <p className="muted">
                Consent version: {consentVersion}. Timestamp, browser and
                available IP information are audit details, not identity
                verification.
              </p>
              <Button disabled={busy}>
                {snapshot.document.type === "ESTIMATE"
                  ? "Approve & Sign"
                  : "Acknowledge & Sign"}
              </Button>
              <hr style={{ margin: "24px 0" }} />
              <label>
                Decline / request changes reason
                <textarea name="reason" maxLength={4000} />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={(e) => {
                  const form = e.currentTarget.closest("form")!;
                  if (!form.reportValidity()) return;
                  submit(form, "DECLINE");
                }}
              >
                Decline / Request Changes
              </Button>
            </form>
          </section>
        )
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
