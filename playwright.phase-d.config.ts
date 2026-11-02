import "dotenv/config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results-phase-d",
  testDir: "./tests/e2e",
  testMatch: "phase-d.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3002",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
    },
  },
  webServer: {
    command: "npm run build && npm start -- --port 3002",
    url: "http://localhost:3002/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUTH_URL: "http://localhost:3002",
      NEXT_TEST_DIST_DIR: ".next-phase-d",
      ANTHROPIC_API_KEY: "DEMO-TEST-MOCK-NOT-A-REAL-KEY",
      NODE_OPTIONS: "--import ./tests/fixtures/ai-provider-preload.mjs",
    },
  },
});
