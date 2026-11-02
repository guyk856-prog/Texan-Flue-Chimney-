/* eslint-disable @next/next/no-head-element -- Offline PDF HTML, not a Next page. */
// Built into one Node module. All document content comes only from the validated snapshot.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import serverless from "@sparticuz/chromium";
import { snapshotSchema } from "../src/lib/snapshot";
import { EstimateDocument, PRINT_CSS, PHASE_C_CSS } from "../src/pdf/document";
export async function render(input: unknown) {
  const snapshot = snapshotSchema.parse(input);
  const [serif, sans] = await Promise.all([
    readFile(path.resolve("templates/fonts/LibreBaskerville.ttf")),
    readFile(path.resolve("templates/fonts/SourceSans3.ttf")),
  ]);
  const fonts = `@font-face{font-family:LibreBaskerville;src:url(data:font/ttf;base64,${serif.toString("base64")}) format('truetype');font-weight:400 700}@font-face{font-family:SourceSans;src:url(data:font/ttf;base64,${sans.toString("base64")}) format('truetype');font-weight:200 900}`;
  const browser = await chromium.launch({
    args: serverless.args,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (await serverless.executablePath()),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (r) => r.abort());
    await page.setContent(
      "<!doctype html>" +
        renderToStaticMarkup(
          <html lang="en">
            <head>
              <meta charSet="utf-8" />
              <style>{fonts + PRINT_CSS + PHASE_C_CSS}</style>
            </head>
            <body>
              <EstimateDocument snapshot={snapshot} />
            </body>
          </html>,
        ),
      { waitUntil: "load", timeout: 20000 },
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (
        !document.fonts.check("10px SourceSans") ||
        !document.fonts.check("10px LibreBaskerville")
      )
        throw new Error("Required print font unavailable");
      for (const img of document.images)
        if (!img.complete || !img.naturalWidth)
          throw new Error("Required snapshot image unavailable");
      const heading =
        document.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      for (const row of document.querySelectorAll("tbody tr"))
        if (
          row.getBoundingClientRect().height >
          Math.floor(9.65 * 96) - heading
        )
          throw new Error("LINE_ITEM_TOO_TALL");
    });
    const footer = renderToStaticMarkup(
      <div
        style={{
          fontFamily: "SourceSans, sans-serif",
          fontSize: "8px",
          color: "#565047",
          width: "100%",
          padding: "0 .55in",
          textAlign: "center",
        }}
      >
        <style>{fonts}</style>
        <div>{snapshot.disclaimer}</div>
        {snapshot.footerCopy && <div>{snapshot.footerCopy}</div>}
        <div>
          Page <span className="pageNumber" /> of{" "}
          <span className="totalPages" />
        </div>
      </div>,
    );
    return Buffer.from(
      await page.pdf({
        format: "Letter",
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: footer,
      }),
    );
  } finally {
    await browser.close();
  }
}
