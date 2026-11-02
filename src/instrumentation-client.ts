const send = (code: string) => {
  void fetch("/api/monitor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }).catch(() => {});
};
window.addEventListener("error", () => send("BROWSER_RUNTIME_FAILED"));
window.addEventListener("unhandledrejection", () =>
  send("BROWSER_PROMISE_FAILED"),
);
