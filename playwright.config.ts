import "dotenv/config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.AUTH_URL ?? "http://localhost:3000",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: `${process.env.AUTH_URL ?? "http://localhost:3000"}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
