export async function reportEvent(code: string, reference?: string) {
  const event = {
    eventId: crypto.randomUUID(),
    code,
    reference: reference?.slice(0, 80) ?? null,
    at: new Date().toISOString(),
  };
  console.error(JSON.stringify(event));
  if (process.env.ERROR_WEBHOOK_URL) {
    try {
      const url = new URL(process.env.ERROR_WEBHOOK_URL);
      if (url.protocol !== "https:") return;
      await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.ERROR_WEBHOOK_TOKEN
            ? { authorization: `Bearer ${process.env.ERROR_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* Monitoring must never break the user action. */
    }
  }
  return event.eventId;
}
