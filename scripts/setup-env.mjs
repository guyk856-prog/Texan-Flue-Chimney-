import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
try {
  await readFile(".env");
  console.log("Existing .env preserved.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const template = await readFile(".env.example", "utf8");
  const contents = template
    .replace(
      /^AUTH_SECRET=$/m,
      `AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
    )
    .replace(
      /^SEED_DEMO_PASSWORD=$/m,
      `SEED_DEMO_PASSWORD=${randomBytes(24).toString("base64url")}`,
    );
  await writeFile(".env", contents, { flag: "wx", mode: 0o600 });
  console.log(
    "Created ignored .env with generated local-only secrets. See SEED_DEMO_PASSWORD there for demo login. No credentials were printed.",
  );
}
await chmod(".env", 0o600);
