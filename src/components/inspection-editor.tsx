/* eslint-disable @next/next/no-img-element -- Private expiring image URLs must not be forwarded to a public image optimizer. */
"use client";
import { WritingTool } from "./ai-tools";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import type { readInspection } from "@/lib/inspections";
type Row = Awaited<ReturnType<typeof readInspection>>;
function Photo({ id, caption }: { id: string; caption: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    fetch(`/api/data/files/${id}/link`)
      .then((r) => r.json())
      .then((d) => {
        if (d.url) setSrc(d.url);
      });
  }, [id]);
  return (
    <figure>
      {src && (
        <img
          src={src}
          alt={caption || "Inspection evidence"}
          style={{ maxWidth: "100%", maxHeight: 220 }}
        />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
export function InspectionEditor({
  row,
  canEdit,
  canSignoff,
  canFinalize,
}: {
  row: Row;
  canEdit: boolean;
  canSignoff: boolean;
  canFinalize: boolean;
}) {
  const router = useRouter();
  const [limitations, setLimitations] = useState(row.limitations ?? "");
  const [summary, setSummary] = useState(row.summary ?? "");
  const [recommendations, setRecommendations] = useState(
    row.recommendations ?? "",
  );
  const [weather, setWeather] = useState(row.weather ?? "");
  const [findings, setFindings] = useState(
    row.sections
      .flatMap((s) => s.findings)
      .map((f) => ({
        id: f.id,
        status: f.status,
        severity: f.severity,
        observation: f.observation ?? "",
        recommendation: f.recommendation ?? "",
      })),
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(refresh = true) {
    const r = await fetch(`/api/workflow/inspections/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        limitations,
        summary,
        recommendations,
        weather,
        findings,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error);
      return false;
    }
    setMessage("Inspection saved.");
    if (refresh) router.refresh();
    return true;
  }
  return (
    <>
      <div className="inspection-toolbar">
        <strong>
          {row.document.number} · {row.status}
        </strong>
        {canEdit && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await save();
              } catch {
                setError("Unable to save.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save inspection
          </Button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <section className="panel">
        <h2>Scope and limitations</h2>
        <p>
          Record only what you actually observed. NOT INSPECTED is a valid
          answer and prints prominently.
        </p>
        <label>
          Limitations / areas not examined (required before sign-off)
          <textarea
            disabled={!canEdit}
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
            maxLength={10000}
          />
        </label>
        <div className="fields">
          <label>
            Weather
            <input
              disabled={!canEdit}
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              maxLength={250}
            />
          </label>
          <label>
            Summary
            <textarea
              disabled={!canEdit}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={10000}
            />
          </label>
          <label>
            Recommendations
            <textarea
              disabled={!canEdit}
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              maxLength={10000}
            />
          </label>
        </div>
      </section>
      {row.sections.map((section) => (
        <section className="panel inspection-section" key={section.id}>
          <h2>{section.title}</h2>
          {section.findings.map((f) => {
            const current = findings.find((v) => v.id === f.id)!;
            function update(key: string, value: unknown) {
              setFindings((old) =>
                old.map((v) => (v.id === f.id ? { ...v, [key]: value } : v)),
              );
            }
            return (
              <div key={f.id}>
                <div
                  className="finding-buttons"
                  role="group"
                  aria-label={`${f.title} status`}
                >
                  {(["PASS", "FAIL", "NA", "NOT_INSPECTED"] as const).map(
                    (status) => (
                      <Button
                        type="button"
                        key={status}
                        disabled={!canEdit}
                        variant="outline"
                        aria-pressed={current.status === status}
                        onClick={() => update("status", status)}
                        className={`finding-choice ${current.status === status ? "selected" : ""} ${status}`}
                      >
                        {status === "NA"
                          ? "N/A"
                          : status === "NOT_INSPECTED"
                            ? "NOT INSPECTED"
                            : status}
                      </Button>
                    ),
                  )}
                </div>
                <div className="fields">
                  <label>
                    {f.title} severity
                    <select
                      disabled={!canEdit}
                      value={current.severity ?? ""}
                      onChange={(e) =>
                        update("severity", e.target.value || null)
                      }
                    >
                      <option value="">Not specified</option>
                      {["INFO", "MONITOR", "REPAIR_RECOMMENDED", "URGENT"].map(
                        (v) => (
                          <option key={v}>{v}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    {f.title} observation
                    <textarea
                      disabled={!canEdit}
                      value={current.observation}
                      onChange={(e) => update("observation", e.target.value)}
                      maxLength={10000}
                    />
                  </label>
                  {canEdit && (
                    <WritingTool
                      text={current.observation}
                      notes={f.title}
                      resource={{ kind: "inspection", id: row.id }}
                      onAccept={(text) => update("observation", text)}
                    />
                  )}
                  <label>
                    {f.title} recommendation
                    <textarea
                      disabled={!canEdit}
                      value={current.recommendation}
                      onChange={(e) => update("recommendation", e.target.value)}
                      maxLength={10000}
                    />
                  </label>
                  {canEdit && (
                    <WritingTool
                      text={current.recommendation}
                      notes={current.observation}
                      resource={{ kind: "inspection", id: row.id }}
                      onAccept={(text) => update("recommendation", text)}
                    />
                  )}
                </div>
                <div className="grid">
                  {f.photos.map((p) => (
                    <div key={p.id}>
                      <Photo
                        id={p.fileId}
                        caption={`${p.phase ?? "Evidence"}${p.pairKey ? ` · Pair ${p.pairKey}` : ""}: ${p.caption ?? ""}`}
                      />
                      <a
                        href="#"
                        onClick={async (e) => {
                          e.preventDefault();
                          if (p.originalFileId) {
                            const r = await fetch(
                              `/api/data/files/${p.originalFileId}/link`,
                            );
                            const d = await r.json();
                            if (r.ok) window.location.assign(d.url);
                          }
                        }}
                      >
                        Download private original
                      </a>
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <details>
                    <summary>Add photo / open camera</summary>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setError("");
                        setBusy(true);
                        const form = new FormData(e.currentTarget);
                        form.set("findingId", f.id);
                        try {
                          if (!(await save(false))) return;
                          const r = await fetch(
                            `/api/inspections/${row.id}/photos`,
                            { method: "POST", body: form },
                          );
                          const d = await r.json();
                          if (r.ok) router.refresh();
                          else setError(d.error);
                        } catch {
                          setError("Unable to upload photo.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <div className="fields">
                        <label>
                          Photo
                          <input
                            type="file"
                            name="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            required
                          />
                        </label>
                        <label>
                          Caption
                          <input name="caption" maxLength={1000} />
                        </label>
                        <label>
                          Phase
                          <select name="phase">
                            <option value="">Evidence</option>
                            <option>BEFORE</option>
                            <option>AFTER</option>
                          </select>
                        </label>
                        <label>
                          Before/after pair key
                          <input
                            name="pairKey"
                            placeholder="e.g. firebox-opening"
                            maxLength={100}
                          />
                        </label>
                      </div>
                      <Button disabled={busy}>Upload photo</Button>
                      <p className="muted">
                        Original kept privately; display copy compressed.
                        Maximum 10 MiB.
                      </p>
                    </form>
                  </details>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <div className="panel actions">
        {canSignoff && (
          <Button
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Sign off this inspection as yourself? Save your observations and limitations first; the report locks after sign-off.",
                )
              )
                return;
              setBusy(true);
              try {
                if (!(await save(false))) return;
                const r = await fetch(
                  `/api/workflow/inspections/${row.id}/signoff`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ confirmed: true }),
                  },
                );
                const d = await r.json();
                if (r.ok) router.refresh();
                else setError(d.error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Technician sign-off
          </Button>
        )}
        {canFinalize && (
          <Button
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Finalize the signed-off report and freeze its PDF?",
                )
              )
                return;
              setBusy(true);
              try {
                const r = await fetch(
                  `/api/workflow/inspections/${row.id}/finalize`,
                  { method: "POST" },
                );
                const d = await r.json();
                if (r.ok) router.refresh();
                else setError(d.error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Finalize inspection PDF
          </Button>
        )}
      </div>
    </>
  );
}
