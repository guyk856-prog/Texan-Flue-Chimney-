import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  logging: {
    incomingRequests: { ignore: [/\/(?:api\/)?share\//, /\/api\/files\//] },
  },
  devIndicators: false,
  experimental: { authInterrupts: true },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer"],
};
export default config;
