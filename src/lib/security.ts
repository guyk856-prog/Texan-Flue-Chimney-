import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "./errors";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
// Single-instance limiter. Use a shared limiter before running multiple replicas.
const buckets = new Map<string, { count: number; expires: number }>();
export function limit(key: string, max = 10, windowMs = 900_000) {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.expires <= now) buckets.delete(k);
  const b = buckets.get(key) ?? { count: 0, expires: now + windowMs };
  if (b.count >= max)
    throw new HttpError(429, "Too many attempts. Try again later.");
  b.count++;
  buckets.set(key, b);
}
