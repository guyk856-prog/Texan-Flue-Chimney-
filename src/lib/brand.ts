import { readFile } from "node:fs/promises";
import path from "node:path";
export async function logoData() {
  const bytes = await readFile(
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public/brand/logo-mark.webp",
    ),
  );
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}
