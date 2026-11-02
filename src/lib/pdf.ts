import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { HttpError } from "./errors";
import type { EstimateSnapshot } from "./snapshot";
// Keep React rendering/browser execution out of the application server bundle.
export async function renderPdf(snapshot: EstimateSnapshot): Promise<Buffer> {
  if (process.env.VERCEL || process.env.PDF_RUNTIME === "serverless") {
    try {
      const engine = (
        await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(
            path.join(
              /* turbopackIgnore: true */ process.cwd(),
              "dist/pdf-engine.cjs",
            ),
          ).href
        )
      ).default as { render: (v: unknown) => Promise<Buffer> };
      return await engine.render(snapshot);
    } catch (e) {
      if (e instanceof Error && e.message.includes("LINE_ITEM_TOO_TALL"))
        throw new HttpError(
          400,
          "A line item exceeds one printable page. Shorten its description or split its scope into separate line items.",
        );
      throw e;
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(
          /* turbopackIgnore: true */ process.cwd(),
          "scripts/render-pdf.tsx",
        ),
      ],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          NODE_ENV: process.env.NODE_ENV,
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    let error = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 20 * 1024 * 1024) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (error.length < 10000) error += String(chunk);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        if (error.includes("LINE_ITEM_TOO_TALL"))
          reject(
            new HttpError(
              400,
              "A line item exceeds one printable page. Shorten its description or split its scope into separate line items.",
            ),
          );
        else reject(new Error(`PDF renderer failed: ${error}`));
      } else {
        const pdf = Buffer.concat(chunks);
        if (pdf.subarray(0, 5).toString() !== "%PDF-")
          reject(new Error("Invalid PDF output"));
        else resolve(pdf);
      }
    });
    child.stdin.end(JSON.stringify(snapshot));
  });
}
