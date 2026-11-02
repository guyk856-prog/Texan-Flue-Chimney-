"use client";
import { sendFile } from "@/lib/upload-client";
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
  const [progress, setProgress] = useState(0);
  return (
    <>
      <section className="panel">
        <h2>Private upload</h2>
        <p className="muted">
          PDF, PNG, JPEG or WebP. Maximum 10 MiB. Downloads require your session
          and expire after five minutes.
        </p>
        {busy && (
          <progress
            aria-label="File upload progress"
            value={progress}
            max={100}
          />
        )}
        <form
          id="private-upload"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              const form = new FormData(e.currentTarget);
              const file = form.get("file");
              if (!(file instanceof File)) return;
              await sendFile(
                file,
                {
                  purpose: "FILE",
                  metadata: { jobId: form.get("jobId") || null },
                },
                setProgress,
              );
              router.refresh();
            } catch (error) {
              setError(
                (error instanceof Error ? error.message + " " : "") +
                  "Your selected file remains here. Check the file requirements and connection, then retry.",
              );
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
        {!rows.length && (
          <div className="empty-state">
            <h2>No private files yet</h2>
            <p>
              Keep job documents and evidence together with controlled
              downloads.
            </p>
            <a className="empty-action" href="#private-upload">
              Upload first file
            </a>
          </div>
        )}
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
                  setError(
                    "The download did not start. Check your connection, then choose Download again.",
                  );
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
