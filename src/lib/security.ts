import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "./errors";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
// Hosted instances share atomic PostgreSQL buckets; local development can use memory.
type Bucket = { count: number; expires: number };
const shared = globalThis as unknown as {
  texanRateBuckets?: Map<string, Bucket>;
};
const buckets = (shared.texanRateBuckets ??= new Map<string, Bucket>());
export async function limit(key: string, max = 10, windowMs = 900_000) {
  if (process.env.VERCEL || process.env.RATE_LIMIT_DRIVER === "database") {
    const { db } = await import("./db");
    const hashed = hashToken(key);
    const expires = new Date(Date.now() + windowMs);
    const rows = await db.$queryRaw<
      { count: number }[]
    >`INSERT INTO "RateLimitBucket" ("keyHash",count,"expiresAt") VALUES (${hashed},1,${expires}) ON CONFLICT ("keyHash") DO UPDATE SET count=CASE WHEN "RateLimitBucket"."expiresAt"<=now() THEN 1 ELSE LEAST("RateLimitBucket".count+1,2147483647) END,"expiresAt"=CASE WHEN "RateLimitBucket"."expiresAt"<=now() THEN ${expires} ELSE "RateLimitBucket"."expiresAt" END RETURNING count`;
    if (rows[0].count > max)
      throw new HttpError(
        429,
        "Too many attempts. Wait a few minutes, then try again.",
      );
    return;
  }
  const now = Date.now();
  for (const [k, v] of buckets) if (v.expires <= now) buckets.delete(k);
  const b = buckets.get(key) ?? { count: 0, expires: now + windowMs };
  if (b.count >= max)
    throw new HttpError(429, "Too many attempts. Try again later.");
  b.count++;
  buckets.set(key, b);
}
