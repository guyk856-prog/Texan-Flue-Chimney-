import { execFileSync } from "node:child_process";
export default function setup() {
  const url = new URL(process.env.PHASE_E_DATABASE_URL!);
  if (!/^texan_e_\d+$/.test(url.pathname.slice(1)))
    throw new Error("Refusing to create non-test database");
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "createdb",
      "-U",
      "texan",
      url.pathname.slice(1),
    ],
    { stdio: "inherit" },
  );
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      DIRECT_URL: url.toString(),
    },
  });
}
