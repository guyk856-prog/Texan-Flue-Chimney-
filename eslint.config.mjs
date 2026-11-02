import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    ".next/**",
    "dist/**",
    ".next-phase-e/**",
    ".next-phase-d/**",
    "node_modules/**",
    "private/**",
    "test-results/**",
    "test-results-phase-e/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);
