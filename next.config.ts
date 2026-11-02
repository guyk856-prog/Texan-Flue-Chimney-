import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NEXT_TEST_DIST_DIR ?? ".next",
  poweredByHeader: false,
  logging: {
    incomingRequests: { ignore: [/\/(?:api\/)?share\//, /\/api\/files\//] },
  },
  devIndicators: false,
  experimental: { authInterrupts: true },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer"],
};
export default config;
