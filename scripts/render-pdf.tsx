/* eslint-disable @next/next/no-head-element -- Standalone Node PDF HTML, not a Next.js page. */
// This worker has no database import or application authentication access.
// It receives only a fully denormalized, validated snapshot on stdin.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { snapshotSchema } from "../src/lib/snapshot";
import { EstimateDocument, PRINT_CSS } from "../src/pdf/document";
async function main() {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 4 * 1024 * 1024) throw new Error("Snapshot too large");
    chunks.push(Buffer.from(chunk));
  }
  const snapshot = snapshotSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
  const [serif, sans] = await Promise.all([
    readFile(path.resolve("templates/fonts/LibreBaskerville.ttf")),
    readFile(path.resolve("templates/fonts/SourceSans3.ttf")),
  ]);
  const fonts = `@font-face{font-family:LibreBaskerville;src:url(data:font/ttf;base64,${serif.toString("base64")}) format('truetype');font-weight:400 700}@font-face{font-family:SourceSans;src:url(data:font/ttf;base64,${sans.toString("base64")}) format('truetype');font-weight:200 900}`;
  const html =
    "<!doctype html>" +
    renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <style>{fonts + PRINT_CSS}</style>
        </head>
        <body>
          <EstimateDocument snapshot={snapshot} />
        </body>
      </html>,
    );
  const secret = randomBytes(32).toString("hex");
  const server = createServer((req, res) => {
    if (req.url !== `/${secret}`) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No private renderer port");
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${address.port}/${secret}`;
    await page.route("**/*", (route) =>
      route.request().url() === url ? route.continue() : route.abort(),
    );
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (
        !document.fonts.check("10px SourceSans") ||
        !document.fonts.check("10px LibreBaskerville")
      )
        throw new Error("Required PDF font failed to load");
    });
    await page.evaluate(() => {
      const printableHeight = Math.floor(9.65 * 96);
      const headingHeight =
        document.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      for (const row of document.querySelectorAll("tbody tr")) {
        if (
          row.getBoundingClientRect().height >
          printableHeight - headingHeight
        )
          throw new Error("LINE_ITEM_TOO_TALL");
      }
    });
    const footer = renderToStaticMarkup(
      <div
        style={{
          fontFamily: "SourceSans, sans-serif",
          fontSize: "8px",
          color: "#6F6A63",
          width: "100%",
          padding: "0 0.55in",
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
    const pdf = await page.pdf({
      format: "Letter",
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: footer,
    });
    process.stdout.write(pdf);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
