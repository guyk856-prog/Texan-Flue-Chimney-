import "dotenv/config";
import { request } from "@playwright/test";

const baseURL = process.env.AUTH_URL ?? "http://localhost:3000";
if (!process.env.SEED_DEMO_PASSWORD)
  throw new Error(
    "SEED_DEMO_PASSWORD is required for the local demo smoke check.",
  );
const client = await request.newContext({ baseURL });
try {
  const csrf = await (await client.get("/api/auth/csrf")).json();
  const signedIn = await client.post("/api/auth/callback/credentials", {
    headers: { origin: new URL(baseURL).origin, "X-Auth-Return-Redirect": "1" },
    form: {
      csrfToken: csrf.csrfToken,
      email: "demo.office@example.test",
      password: process.env.SEED_DEMO_PASSWORD,
      callbackUrl: `${baseURL}/dashboard`,
    },
  });
  if (!signedIn.ok()) throw new Error("Demo login request failed.");
  const response = await client.get("/api/data/dashboard");
  if (!response.ok())
    throw new Error(
      `Authenticated database request failed (${response.status()}).`,
    );
  const counts = await response.json();
  if (
    !Number.isInteger(counts.customerCount) ||
    !Number.isInteger(counts.jobCount)
  )
    throw new Error("Invalid live dashboard counts.");
  const fresh = await (await client.get("/api/auth/csrf")).json();
  const out = await client.post("/api/auth/signout", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: { csrfToken: fresh.csrfToken, callbackUrl: `${baseURL}/login` },
  });
  if (!out.ok() || (await client.get("/api/data/dashboard")).status() !== 401)
    throw new Error("Session revocation failed.");
  console.log(
    "PASS: Auth.js login, authenticated PostgreSQL dashboard and sign-out revocation.",
  );
} finally {
  await client.dispose();
}
