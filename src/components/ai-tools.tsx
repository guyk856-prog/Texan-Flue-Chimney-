"use client";
import { createContext, useContext, useState, useRef } from "react";
import { Button } from "./ui/button";
import { WRITING_ACTIONS } from "@/lib/ai/contract";
export const AIContext = createContext(false);
export function WritingTool({
  text,
  onAccept,
  serviceId = null,
  notes = "",
  resource = null,
}: {
  text: string;
  onAccept: (text: string) => void;
  serviceId?: string | null;
  notes?: string;
  resource?: { kind: "estimate" | "inspection" | "job"; id: string } | null;
}) {
  const enabled = useContext(AIContext),
    abort = useRef<AbortController | null>(null);
  const [action, setAction] = useState<string>(WRITING_ACTIONS[0]);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  return (
    <details className="ai-writing">
      <summary>Write with AI / improve text</summary>
      <label>
        Writing action
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {WRITING_ACTIONS.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Human notes (Hebrew or English)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={10000}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          abort.current = new AbortController();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/ai/write", {
              method: "POST",
              signal: abort.current.signal,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action,
                text,
                notes: [notes, note].filter(Boolean).join("\n"),
                serviceId,
                resource,
              }),
            });
            const d = await r.json();
            if (r.ok) setPreview(d.text);
            else setError(d.error);
          } catch {
            setError("Request cancelled or unavailable. Continue manually.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Write with AI
      </Button>
      {busy && (
        <Button
          type="button"
          variant="outline"
          onClick={() => abort.current?.abort()}
        >
          Cancel AI request
        </Button>
      )}
      {preview !== null && (
        <section className="panel">
          <h3>Preview writing — nothing saved</h3>
          <div className="ai-diff">
            <div>
              <strong>Before</strong>
              <p>{text || "(empty)"}</p>
            </div>
            <label>
              Proposed text (editable)
              <textarea
                value={preview}
                onChange={(e) => setPreview(e.target.value)}
              />
            </label>
          </div>
          <Button
            type="button"
            onClick={() => {
              onAccept(preview);
              setPreview(null);
            }}
          >
            Accept writing into field
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreview(null)}
          >
            Discard suggestion
          </Button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
export function AIConfiguration({ enabled }: { enabled: boolean }) {
  const [value, setValue] = useState(enabled),
    [message, setMessage] = useState("");
  return (
    <section className="panel">
      <h2>AI assistance</h2>
      <p>
        Off by default. A server-side Anthropic key is also required. Manual
        workflows always remain available.
      </p>
      <label>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => setValue(e.target.checked)}
        />
        Enable AI assistance for this organization
      </label>
      <Button
        type="button"
        onClick={async () => {
          const r = await fetch("/api/ai/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: value }),
          });
          const d = await r.json();
          setMessage(
            r.ok
              ? d.available
                ? "Enabled. Refresh to show tools."
                : "Saved. Tools remain hidden until the server key is configured."
              : d.error,
          );
        }}
      >
        Save AI setting
      </Button>
      <p>{message}</p>
    </section>
  );
}

export function AIProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <AIContext.Provider value={enabled}>{children}</AIContext.Provider>;
}
