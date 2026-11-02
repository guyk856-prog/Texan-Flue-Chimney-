// Vercel preview aliases have their own origin; never send preview reset/share links to production.
if (
  process.env.VERCEL &&
  process.env.VERCEL_ENV !== "production" &&
  process.env.VERCEL_URL
)
  process.env.AUTH_URL = `https://${process.env.VERCEL_URL}`;
export {};

if (process.env.VERCEL && !process.env.AUTH_URL) {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (host) process.env.AUTH_URL = `https://${host}`;
}
