import "dotenv/config";
import { defineConfig } from "@playwright/test";
const database = new URL(process.env.DATABASE_URL!);
database.pathname = "/texan_e_" + Date.now();
process.env.PHASE_E_DATABASE_URL ??= database.toString();
process.env.PHASE_E_BASE_URL = "http://localhost:3003";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase-e.spec.ts",
  outputDir: "test-results-phase-e",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  globalSetup: "./tests/phase-e-global-setup.ts",
  use: {
    baseURL: process.env.PHASE_E_BASE_URL,
    viewport: { width: 375, height: 812 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm start -- --port 3003",
    url: "http://localhost:3003/login",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      DATABASE_URL: process.env.PHASE_E_DATABASE_URL,
      DIRECT_URL: process.env.PHASE_E_DATABASE_URL,
      AUTH_URL: "http://localhost:3003",
      NEXT_TEST_DIST_DIR: ".next-phase-e",
      STORAGE_DRIVER: "filesystem",
      PRIVATE_STORAGE_DIR: "/tmp/texan-phase-e-files",
      RATE_LIMIT_DRIVER: "database",
      BOOTSTRAP_TOKEN: "DEMO_ONLY_BOOTSTRAP_TEST_TOKEN_2026",
      ANTHROPIC_API_KEY: "",
      PDF_RUNTIME: "serverless",
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "",
    },
  },
});
