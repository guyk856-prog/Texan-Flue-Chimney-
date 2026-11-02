"use client";
import { useState, useEffect } from "react";
export function SessionGuard() {
  const [state, setState] = useState<"ok" | "soon" | "expired" | "offline">(
    "ok",
  );
  async function check() {
    try {
      const r = await fetch("/api/session-status", { cache: "no-store" });
      if (!r.ok) {
        setState("offline");
        return;
      }
      const d = await r.json();
      setState(
        !d.active
          ? "expired"
          : new Date(d.expiresAt).getTime() - Date.now() < 300000
            ? "soon"
            : "ok",
      );
    } catch {
      setState("offline");
    }
  }
  useEffect(() => {
    const initial = setTimeout(() => void check(), 0);
    const timer = setInterval(() => void check(), 60000);
    window.addEventListener("online", check);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, []);
  if (state === "ok") return null;
  return (
    <section role="status" className="session-warning">
      <strong>
        {state === "expired"
          ? "Your session ended."
          : state === "soon"
            ? "Your session will end soon."
            : "Connection unavailable."}
      </strong>
      <p>
        {state === "offline"
          ? "Keep working in the inspection form. Notes and queued photos stay on this device until synced."
          : "Keep this tab open. Sign in in another tab, then return here and save your work. Unsaved fields in this tab will not be cleared."}
      </p>
      {state !== "offline" && (
        <a
          className="empty-action"
          href="/login"
          target="_blank"
          rel="noreferrer"
        >
          Sign in in a new tab
        </a>
      )}{" "}
      <button onClick={() => void check()}>Check connection and session</button>
    </section>
  );
}
