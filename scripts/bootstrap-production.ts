// The browser /setup flow is the normal production bootstrap. This operator command is optional.
import "dotenv/config";
import { bootstrap } from "../src/lib/bootstrap";
if (
  !process.env.OWNER_EMAIL ||
  !process.env.OWNER_PASSWORD ||
  !process.env.OWNER_NAME
)
  throw new Error(
    "Set OWNER_EMAIL, OWNER_PASSWORD and OWNER_NAME securely, or use /setup.",
  );
await bootstrap({
  token: process.env.BOOTSTRAP_TOKEN,
  email: process.env.OWNER_EMAIL,
  password: process.env.OWNER_PASSWORD,
  name: process.env.OWNER_NAME,
});
console.log(
  "Owner created without demo data. Sign in and complete guided setup.",
);
process.exit(0);
