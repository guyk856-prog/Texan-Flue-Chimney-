"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { DEFAULT_ESTIMATE_LAYOUT, type Layout } from "@/lib/template-contract";
export function TemplateEditor({ initial }: { initial: Layout | null }) {
  const [layout, setLayout] = useState(initial ?? DEFAULT_ESTIMATE_LAYOUT);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Estimate template</h2>
      <p>
        Reorder typed blocks and edit plain-text copy. Saving creates a new
        template version; issued PDFs retain their frozen layout. Required
        disclaimer text cannot be replaced.
      </p>
      {layout.blocks.map((b, i) => (
        <div className="panel" key={i}>
          <div className="toolbar">
            <strong>{b.type}</strong>
            <div className="actions">
              <Button
                variant="outline"
                disabled={!i}
                onClick={() => {
                  const blocks = [...layout.blocks];
                  [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
                  setLayout({ blocks });
                }}
              >
                Move up
              </Button>
              <Button
                variant="outline"
                disabled={i === layout.blocks.length - 1}
                onClick={() => {
                  const blocks = [...layout.blocks];
                  [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
                  setLayout({ blocks });
                }}
              >
                Move down
              </Button>
            </div>
          </div>
          {(b.type === "richText" || b.type === "footer") && (
            <label>
              Optional plain-text copy
              <textarea
                value={b.options.copy ?? ""}
                placeholder={
                  b.type === "richText"
                    ? "Leave blank to use the estimate field"
                    : "Optional copy in addition to the required disclaimer"
                }
                onChange={(e) =>
                  setLayout({
                    blocks: layout.blocks.map((old, j) => {
                      if (j !== i) return old;
                      if (old.type === "richText")
                        return {
                          ...old,
                          options: {
                            ...old.options,
                            copy: e.target.value || undefined,
                          },
                        };
                      if (old.type === "footer")
                        return {
                          ...old,
                          options: {
                            ...old.options,
                            copy: e.target.value || undefined,
                          },
                        };
                      return old;
                    }),
                  })
                }
              />
            </label>
          )}
        </div>
      ))}
      {message && <p role="status">{message}</p>}
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/estimates/templates", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(layout),
            });
            const d = await r.json();
            setMessage(r.ok ? `Saved template version ${d.version}.` : d.error);
          } catch {
            setMessage("Unable to save template.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save new template version
      </Button>
    </section>
  );
}
