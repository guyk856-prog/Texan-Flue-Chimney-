import type { Instrumentation } from "next";
export const onRequestError: Instrumentation.onRequestError = async (error) => {
  const { reportEvent } = await import("./lib/monitoring");
  await reportEvent(
    "SERVER_REQUEST_FAILED",
    typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string"
      ? error.digest
      : undefined,
  );
};
