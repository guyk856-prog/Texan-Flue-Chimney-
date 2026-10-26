"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function FilesScreen({
  rows,
  jobs,
}: {
  rows: { id: string; filename: string; sizeBytes: number }[];
  jobs: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <section className="panel">
        <h2>Private upload</h2>
        <p className="muted">
          PDF, PNG, JPEG or WebP. Maximum 10 MiB. Downloads require your session
          and expire after five minutes.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              const r = await fetch("/api/files", {
                method: "POST",
                body: new FormData(e.currentTarget),
              });
              const d = await r.json();
              if (!r.ok) setError(d.error);
              else router.refresh();
            } catch {
              setError("Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="fields">
            <label>
              File
              <input
                name="file"
                type="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp"
              />
            </label>
            <label>
              Related job (optional)
              <select name="jobId">
                <option value="">Personal upload</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button disabled={busy}>{busy ? "Uploading…" : "Upload"}</Button>
        </form>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="panel">
        <h2>Files</h2>
        {!rows.length && <p className="muted">No files uploaded yet.</p>}
        {rows.map((f) => (
          <div key={f.id} className="rowlink">
            <span>
              {f.filename}{" "}
              <small className="muted">({f.sizeBytes} bytes)</small>
            </span>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const r = await fetch(`/api/data/files/${f.id}/link`);
                  const d = await r.json();
                  if (!r.ok) setError(d.error);
                  else window.location.assign(d.url);
                } catch {
                  setError("Unable to download.");
                }
              }}
            >
              Download
            </Button>
          </div>
        ))}
      </section>
    </>
  );
}
