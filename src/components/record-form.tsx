"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export type Field = {
  name: string;
  label: string;
  required?: boolean;
  type?:
    "text" | "email" | "number" | "textarea" | "checkbox" | "list" | "select";
  options?: { value: string; label: string }[];
};
export function RecordForm({
  fields,
  endpoint,
  initial = {},
  method = "POST",
  successPath,
}: {
  fields: Field[];
  endpoint: string;
  initial?: Record<string, unknown>;
  method?: string;
  successPath?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        const form = new FormData(e.currentTarget);
        const values: Record<string, unknown> = {};
        for (const f of fields) {
          const v = String(form.get(f.name) ?? "");
          if (f.type === "checkbox") values[f.name] = form.has(f.name);
          else if (f.type === "number") {
            if (v !== "") values[f.name] = Number(v);
            else if (f.name === "storeys") values[f.name] = null;
          } else if (f.type === "list")
            values[f.name] = v
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
          else if (f.name === "applianceType" && !v) values[f.name] = null;
          else values[f.name] = v;
        }
        try {
          const r = await fetch(endpoint, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(values),
          });
          const data = await r.json();
          if (!r.ok) setError(data.error ?? "Unable to save.");
          else {
            setSaved(true);
            if (successPath) router.push(successPath.replace(":id", data.id));
            router.refresh();
          }
        } catch {
          setError("Connection failed. Please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="fields">
        {fields.map((f) => {
          const value = initial[f.name];
          const text = Array.isArray(value)
            ? value.join("\n")
            : String(value ?? "");
          return (
            <label key={f.name}>
              {f.label}
              {f.required ? " *" : ""}
              {f.type === "textarea" || f.type === "list" ? (
                <textarea
                  name={f.name}
                  defaultValue={text}
                  required={f.required}
                  maxLength={10000}
                />
              ) : f.type === "checkbox" ? (
                <input
                  name={f.name}
                  type="checkbox"
                  defaultChecked={Boolean(value)}
                />
              ) : f.type === "select" ? (
                <select name={f.name} defaultValue={text} required={f.required}>
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={f.name}
                  type={f.type ?? "text"}
                  defaultValue={text}
                  required={f.required}
                  step={f.type === "number" ? 1 : undefined}
                  min={f.type === "number" ? 0 : undefined}
                  max={f.type === "number" ? 2147483647 : undefined}
                  maxLength={250}
                />
              )}
            </label>
          );
        })}
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {saved && (
        <p role="status" className="success">
          Saved.
        </p>
      )}
      <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
    </form>
  );
}
export function Archive({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <>
      <Button
        variant="destructive"
        onClick={async () => {
          if (
            !window.confirm(
              "Archive this record? It will be hidden from active views.",
            )
          )
            return;
          const r = await fetch(endpoint, { method: "DELETE" });
          const data = await r.json();
          if (!r.ok) setError(data.error);
          else {
            router.push(`/${endpoint.split("/")[3]}`);
            router.refresh();
          }
        }}
      >
        Archive
      </Button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
