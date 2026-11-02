import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NEXT_TEST_DIST_DIR ?? ".next",
  outputFileTracingIncludes: {
    "/*": [
      "./dist/pdf-engine.cjs",
      "./templates/fonts/**",
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/pdfjs-dist/wasm/**",
    ],
  },
  poweredByHeader: false,
  logging: {
    incomingRequests: { ignore: [/\/(?:api\/)?share\//, /\/api\/files\//] },
  },
  devIndicators: false,
  experimental: { authInterrupts: true },
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "nodemailer",
    "playwright-core",
    "@sparticuz/chromium",
    "@napi-rs/canvas",
    "pdfjs-dist",
  ],
};
export default config;
