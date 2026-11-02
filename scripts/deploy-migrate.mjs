import pg from "pg";
import { spawn } from "node:child_process";
for (const name of [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "BLOB_READ_WRITE_TOKEN",
])
  if (!process.env[name])
    throw new Error(
      `Set required environment variable ${name} in the deployment dashboard.`,
    );
if (process.env.AUTH_SECRET.length < 32)
  throw new Error("AUTH_SECRET must be at least 32 random characters.");
if (new URL(process.env.DIRECT_URL).hostname.includes("-pooler"))
  throw new Error(
    "DIRECT_URL must be the Neon connection string with connection pooling switched OFF.",
  );
if (process.env.STORAGE_DRIVER !== "vercel-blob")
  throw new Error("Hosted deployment requires STORAGE_DRIVER=vercel-blob.");
const connection = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  connectionTimeoutMillis: 15000,
  application_name: "texan-deploy",
});
try {
  await connection.connect();
  await connection.query("SET statement_timeout='240s'");
  await connection.query("SELECT pg_advisory_lock(875612339)");
  console.log("Deployment migration lock acquired.");
  await new Promise((resolve, reject) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], {
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Migration failed; this deployment was stopped before build.",
            ),
          ),
    );
  });
} finally {
  await connection.end();
}
