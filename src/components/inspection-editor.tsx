/* eslint-disable @next/next/no-img-element -- Private expiring image URLs must not be forwarded to a public image optimizer. */
"use client";
import { WritingTool } from "./ai-tools";
import { PhotoQueue } from "./photo-queue";
import { localGet, localPut, localDelete } from "@/lib/offline-store";
import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
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
  userId,
  canEdit,
  canSignoff,
  canFinalize,
}: {
  row: Row;
  userId: string;
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

  const storageKey = `${userId}:inspection:${row.id}`;
  type Draft = {
    limitations: string;
    summary: string;
    recommendations: string;
    weather: string;
    findings: typeof findings;
  };
  const initial: Draft = {
    limitations: row.limitations ?? "",
    summary: row.summary ?? "",
    recommendations: row.recommendations ?? "",
    weather: row.weather ?? "",
    findings: row.sections
      .flatMap((s) => s.findings)
      .map((f) => ({
        id: f.id,
        status: f.status,
        severity: f.severity,
        observation: f.observation ?? "",
        recommendation: f.recommendation ?? "",
      })),
  };
  const payload: Draft = {
    limitations,
    summary,
    recommendations,
    weather,
    findings,
  };
  const latest = useRef(payload);

  const serverCopy = useRef(JSON.stringify(initial));
  const version = useRef(new Date(row.updatedAt).toISOString());
  const [recovered, setRecovered] = useState(false),
    [localStatus, setLocalStatus] = useState(
      "Checking this device for unsaved work…",
    ),
    [conflict, setConflict] = useState<Row | null>(null);
  const saving = useRef(false),
    saveRef = useRef<(refresh?: boolean) => Promise<boolean>>(
      async () => false,
    );
  const restore = useCallback((v: Draft) => {
    setLimitations(v.limitations);
    setSummary(v.summary);
    setRecommendations(v.recommendations);
    setWeather(v.weather);
    setFindings(v.findings);
  }, []);
  useEffect(() => {
    let alive = true;
    localGet<{ key: string; values: Draft; version: string }>(
      "drafts",
      storageKey,
    )
      .then((saved) => {
        if (!alive) return;
        if (saved && canEdit) {
          restore(saved.values);
          version.current = saved.version;
          setLocalStatus(
            "Recovered unsaved work from this device. Review and sync when connected.",
          );
        } else setLocalStatus("Saved to server.");
        setRecovered(true);
      })
      .catch(() => {
        setRecovered(true);
        setLocalStatus(
          "Offline storage is unavailable. Keep this page open until you save to the server.",
        );
      });
    const online = () => {
      void saveRef.current(false);
    };
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.removeEventListener("online", online);
    };
  }, [storageKey, canEdit, restore]);
  const fingerprint = JSON.stringify(payload);
  useEffect(() => {
    if (!recovered || !canEdit || fingerprint === serverCopy.current) return;
    let alive = true;
    localPut("drafts", {
      key: storageKey,
      values: JSON.parse(fingerprint),
      version: version.current,
    })
      .then(() => {
        if (alive)
          setLocalStatus(
            "Saved on this device — unsynced changes. Keep this device until synced.",
          );
      })
      .catch(() =>
        setLocalStatus(
          "Device storage is unavailable. Keep this page open and save online before leaving.",
        ),
      );
    return () => {
      alive = false;
    };
  }, [fingerprint, storageKey, recovered, canEdit]);
  async function save(refresh = true) {
    if (saving.current) return false;
    if (!navigator.onLine) {
      setError(
        "Offline. Notes are kept on this device and will sync when the connection returns.",
      );
      return false;
    }
    const input = latest.current;
    saving.current = true;
    try {
      const r = await fetch(`/api/workflow/inspections/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, expectedUpdatedAt: version.current }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(
          d.error ??
            "Could not save. Your notes remain on this device; retry when connected.",
        );
        if (r.status === 409) {
          const current = await fetch(`/api/workflow/inspections/${row.id}`);
          if (current.ok) setConflict(await current.json());
        }
        return false;
      }
      version.current = new Date(d.updatedAt).toISOString();
      serverCopy.current = JSON.stringify(input);
      if (JSON.stringify(latest.current) === serverCopy.current) {
        await localDelete("drafts", storageKey);
        // Typing can continue while the IndexedDB delete is committing.
        if (JSON.stringify(latest.current) !== serverCopy.current) {
          await localPut("drafts", {
            key: storageKey,
            values: latest.current,
            version: version.current,
          });
          setLocalStatus("Newer notes are saved on this device; sync again.");
        } else setLocalStatus("Saved to server.");
      } else {
        await localPut("drafts", {
          key: storageKey,
          values: latest.current,
          version: version.current,
        });
        setLocalStatus("Newer notes are saved on this device; sync again.");
      }
      setConflict(null);
      setError("");
      setMessage("Inspection saved.");
      if (refresh) router.refresh();
      return true;
    } catch {
      setError(
        "Connection lost. Your notes remain on this device. Retry or wait for the connection to return.",
      );
      return false;
    } finally {
      saving.current = false;
    }
  }
  useLayoutEffect(() => {
    latest.current = payload;
    saveRef.current = save;
  });
  return (
    <>
      {canEdit && (
        <div className="offline-banner" role="status">
          {localStatus}
        </div>
      )}
      {conflict && (
        <section className="panel">
          <h2>Review saved-version conflict</h2>
          <p>
            Nothing was overwritten. Compare the server copy with your local
            notes before choosing how to continue.
          </p>
          <details>
            <summary>View server notes</summary>
            <pre>
              {JSON.stringify(
                {
                  limitations: conflict.limitations,
                  summary: conflict.summary,
                  recommendations: conflict.recommendations,
                  findings: conflict.sections.flatMap((s) => s.findings),
                },
                null,
                2,
              )}
            </pre>
          </details>
          <Button
            onClick={() => {
              version.current = new Date(conflict.updatedAt).toISOString();
              void save(false);
            }}
          >
            Confirm keeping my local edits over this server version
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (
                !window.confirm(
                  "Replace this device’s unsynced notes with the server copy?",
                )
              )
                return;
              const values: Draft = {
                limitations: conflict.limitations ?? "",
                summary: conflict.summary ?? "",
                recommendations: conflict.recommendations ?? "",
                weather: conflict.weather ?? "",
                findings: conflict.sections
                  .flatMap((s) => s.findings)
                  .map((f) => ({
                    id: f.id,
                    status: f.status,
                    severity: f.severity,
                    observation: f.observation ?? "",
                    recommendation: f.recommendation ?? "",
                  })),
              };
              serverCopy.current = JSON.stringify(values);
              version.current = new Date(conflict.updatedAt).toISOString();
              restore(values);
              void localDelete("drafts", storageKey);
              setConflict(null);
              setLocalStatus("Saved to server.");
            }}
          >
            Use server copy and discard local edits
          </Button>
        </section>
      )}
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
                setError(
                  "Your changes were not saved. Your entries remain here. Check your connection and retry.",
                );
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
            disabled={!canEdit || !recovered}
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
            maxLength={10000}
          />
        </label>
        <div className="fields">
          <label>
            Weather
            <input
              disabled={!canEdit || !recovered}
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              maxLength={250}
            />
          </label>
          <label>
            Summary
            <textarea
              disabled={!canEdit || !recovered}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={10000}
            />
          </label>
          <label>
            Recommendations
            <textarea
              disabled={!canEdit || !recovered}
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
                        disabled={!canEdit || !recovered}
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
                      disabled={!canEdit || !recovered}
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
                      disabled={!canEdit || !recovered}
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
                      disabled={!canEdit || !recovered}
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
                    <PhotoQueue
                      userId={userId}
                      inspectionId={row.id}
                      findingId={f.id}
                      beforeUpload={() => save(false)}
                    />
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
