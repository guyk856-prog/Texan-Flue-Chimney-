"use client";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { sendFile } from "@/lib/upload-client";
import { localPut, localList, localDelete } from "@/lib/offline-store";
type Pending = {
  key: string;
  file: Blob;
  name: string;
  mime: string;
  caption: string;
  phase: string | null;
  pairKey: string | null;
  intentId?: string;
};
export function PhotoQueue({
  userId,
  inspectionId,
  findingId,
  beforeUpload,
}: {
  userId: string;
  inspectionId: string;
  findingId: string;
  beforeUpload: () => Promise<boolean>;
}) {
  const prefix = `${userId}:${inspectionId}:${findingId}:`;
  const [items, setItems] = useState<Pending[]>([]),
    [progress, setProgress] = useState<Record<string, number>>({}),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [activeKeys, setActiveKeys] = useState(new Set<string>());
  const active = useRef(new Set<string>()),
    router = useRouter();
  const retryRef = useRef<(p: Pending) => Promise<void>>(async () => {});
  async function refresh() {
    setItems(await localList("photos", prefix));
  }
  async function retry(item: Pending) {
    if (active.current.has(item.key)) return;
    active.current.add(item.key);
    setActiveKeys(new Set(active.current));
    setErrors((p) => ({ ...p, [item.key]: "" }));
    try {
      if (!navigator.onLine)
        throw new Error(
          "Offline — this photo is saved on this device. Retry when connected.",
        );
      if (!(await beforeUpload()))
        throw new Error(
          "Photo is kept locally. Sync the inspection notes or resolve the saved-version conflict first.",
        );
      await sendFile(
        new File([item.file], item.name, { type: item.mime }),
        {
          purpose: "INSPECTION",
          resourceId: inspectionId,
          metadata: {
            findingId,
            caption: item.caption,
            phase: item.phase,
            pairKey: item.pairKey,
          },
          resumeIntentId: item.intentId,
          onIntent: (id) => {
            item.intentId = id;
            void localPut("photos", item);
          },
        },
        (n) => setProgress((p) => ({ ...p, [item.key]: n })),
      );
      await localDelete("photos", item.key);
      await refresh();
      router.refresh();
    } catch (e) {
      setErrors((p) => ({
        ...p,
        [item.key]:
          e instanceof Error
            ? e.message
            : "Upload paused. The original is still on this device; retry this photo.",
      }));
    } finally {
      active.current.delete(item.key);
      setActiveKeys(new Set(active.current));
    }
  }
  useLayoutEffect(() => {
    retryRef.current = retry;
  });
  useEffect(() => {
    let alive = true;
    localList<Pending>("photos", prefix)
      .then((p) => {
        if (alive) setItems(p);
      })
      .catch(() =>
        setErrors({
          storage:
            "This browser cannot keep photos offline. Keep the original on your phone and retry online.",
        }),
      );
    const online = () => {
      void localList<Pending>("photos", prefix).then(async (pending) => {
        for (const p of pending) await retryRef.current(p);
      });
    };
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.removeEventListener("online", online);
    };
  }, [prefix]);
  return (
    <div data-photo-queue>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const file = data.get("file");
          if (!(file instanceof File)) return;
          if (file.size > 10 * 1024 * 1024) {
            setErrors({
              form: "Photo exceeds 10 MiB. Keep the original and choose a smaller image.",
            });
            return;
          }
          const item: Pending = {
            key: prefix + crypto.randomUUID(),
            file,
            name: file.name,
            mime: file.type,
            caption: String(data.get("caption") ?? ""),
            phase: String(data.get("phase") ?? "") || null,
            pairKey: String(data.get("pairKey") ?? "") || null,
          };
          try {
            await localPut("photos", item);
            await refresh();
            form.reset();
            if (navigator.onLine) void retry(item);
          } catch {
            setErrors({
              storage:
                "Device storage is full or unavailable. Your original is still selected; keep it on your phone and try again online.",
            });
          }
        }}
      >
        <div className="fields">
          <label>
            Photo
            <input
              name="file"
              type="file"
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
            <input name="pairKey" maxLength={100} />
          </label>
        </div>
        <Button>Upload photo</Button>
        <p className="muted">
          Original kept privately; display copy compressed. Maximum 10 MiB.
          Queued originals stay on this device until uploaded.
        </p>
      </form>
      {items.map((item) => (
        <section className="panel" key={item.key}>
          <strong>{item.name}</strong>
          <p>{item.caption}</p>
          <progress
            className="photo-progress"
            aria-label={`Upload progress for ${item.name}`}
            max={100}
            value={progress[item.key] ?? 0}
          />
          <p role="status">
            {activeKeys.has(item.key)
              ? `Uploading ${progress[item.key] ?? 0}%`
              : "Saved on this device — not yet attached to the report"}
          </p>
          {errors[item.key] && (
            <p role="alert" className="error">
              {errors[item.key]}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={activeKeys.has(item.key)}
            onClick={() => void retry(item)}
          >
            Retry {item.name}
          </Button>
        </section>
      ))}
      {Object.entries(errors)
        .filter(([k]) => !k.startsWith(prefix))
        .map(([k, v]) => (
          <p key={k} role="alert" className="error">
            {v}
          </p>
        ))}
    </div>
  );
}
