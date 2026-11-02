import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
export async function auditScreens(base, cookies, screens) {
  await mkdir(".lighthouse", { recursive: true });
  const chrome = await launch({
    chromePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  let browser;
  const summary = [];
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
    await browser.contexts()[0].addCookies(cookies);
    for (const [name, route] of screens) {
      const result = await lighthouse(base + route, {
        port: chrome.port,
        onlyCategories: ["accessibility"],
        disableStorageReset: true,
        logLevel: "error",
        output: "json",
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 812,
          deviceScaleFactor: 1,
        },
        throttlingMethod: "provided",
      });
      if (!result) throw new Error("Lighthouse produced no report.");
      await writeFile(`.lighthouse/${name}.json`, JSON.stringify(result.lhr));
      const failures = Object.values(result.lhr.audits)
        .filter((a) => a.score === 0)
        .map((a) => ({ id: a.id, title: a.title }));
      console.log(
        "Lighthouse",
        name,
        Math.round(result.lhr.categories.accessibility.score * 100),
      );
      summary.push({
        screen: name,
        score: Math.round(result.lhr.categories.accessibility.score * 100),
        failures,
      });
    }
    await writeFile(
      "docs/screenshots/phase-e-accessibility.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          tool: "Lighthouse " + (summary.length ? "real Chrome audit" : ""),
          viewport: { width: 375, height: 812 },
          screens: summary,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify(summary));
    return summary;
  } finally {
    await browser?.close();
    await Promise.resolve(chrome.kill()).catch(() => {});
  }
}
if (process.argv[1]?.endsWith("/accessibility.mjs")) {
  const state = JSON.parse(
    await readFile(
      process.env.ACCESSIBILITY_SESSION_FILE ??
        "private/accessibility-session.json",
      "utf8",
    ),
  );
  await auditScreens(
    process.env.AUTH_URL ?? "http://localhost:3000",
    state.cookies,
    [
      ["login", "/login"],
      ["dashboard", "/dashboard"],
      ["customers", "/customers"],
      ["estimates", "/estimates"],
      ["privacy", "/legal/privacy"],
    ],
  );
}
