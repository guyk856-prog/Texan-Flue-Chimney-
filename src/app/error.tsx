"use client";
import Link from "next/link";

import { useEffect } from "react";
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    void fetch("/api/monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "PAGE_RENDER_FAILED",
        reference: error.digest ?? null,
      }),
    }).catch(() => {});
  }, [error.digest]);
  return (
    <main>
      <section role="alert" className="panel">
        <h1>We couldn’t load this screen</h1>
        <p>
          Your saved records are still available. Check your connection, then
          try again. Unsaved inspection work stays on this device.
        </p>
        {error.digest && <p>Support reference: {error.digest}</p>}
        <button onClick={retry}>Try loading again</button>{" "}
        <Link href="/dashboard">Return to dashboard</Link>
      </section>
    </main>
  );
}
