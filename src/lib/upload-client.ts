import { upload as directUpload } from "@vercel/blob/client";
export type UploadOptions = {
  purpose: "FILE" | "INSPECTION" | "AI_SOURCE";
  resourceId?: string;
  metadata: Record<string, unknown>;
  resumeIntentId?: string;
  onIntent?: (id: string) => void;
};
export async function sendFile(
  file: File,
  options: UploadOptions,
  progress: (percent: number) => void,
): Promise<{ id: string; filename: string }> {
  const config = await fetch("/api/storage/config").then(async (r) => {
    if (!r.ok)
      throw new Error(
        "Your session expired. Sign in again; the selected file is still queued.",
      );
    return r.json();
  });
  async function commit(id: string) {
    const r = await fetch("/api/storage/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await r.json();
    return { r, d };
  }
  if (config.direct) {
    if (options.resumeIntentId) {
      const { r, d } = await commit(options.resumeIntentId);
      if (r.ok) {
        progress(100);
        return d;
      }
      if (r.status !== 404)
        throw new Error(d.error ?? "Upload could not be checked. Retry.");
    }
    const r = await fetch("/api/storage/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        purpose: options.purpose,
        resourceId: options.resourceId ?? null,
        metadata: options.metadata,
      }),
    });
    const ticket = await r.json();
    if (!r.ok) throw new Error(ticket.error);
    options.onIntent?.(ticket.id);
    await directUpload(ticket.storageKey, file, {
      access: "private",
      handleUploadUrl: "/api/storage/upload",
      clientPayload: ticket.id,
      onUploadProgress: (e) => progress(Math.round(e.percentage)),
    });
    const result = await commit(ticket.id);
    if (!result.r.ok) throw new Error(result.d.error);
    progress(100);
    return result.d;
  }
  const form = new FormData();
  form.set("file", file);
  for (const [k, v] of Object.entries(options.metadata))
    if (v !== null && v !== undefined) form.set(k, String(v));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      options.purpose === "INSPECTION"
        ? `/api/inspections/${options.resourceId}/photos`
        : "/api/files",
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(
        new Error("Connection lost. Your file is still queued; retry it."),
      );
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Upload did not finish. Try this file again."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        progress(100);
        resolve(data);
      } else
        reject(
          new Error(
            data.error ?? "Upload could not be saved. Try this file again.",
          ),
        );
    };
    xhr.send(form);
  });
}
