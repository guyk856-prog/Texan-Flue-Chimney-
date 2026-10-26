import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  experimental: { authInterrupts: true },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer"],
};
export default config;
