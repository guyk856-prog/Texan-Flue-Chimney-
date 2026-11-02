import { build } from "esbuild";
await build({
  entryPoints: ["scripts/render-serverless.tsx"],
  outfile: "dist/pdf-engine.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  target: "node22",
  jsx: "automatic",
});
