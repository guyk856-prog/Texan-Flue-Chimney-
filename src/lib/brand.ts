import type { Prisma } from "@prisma/client";
import { readStored } from "./storage";
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function logoData(
  tx?: Prisma.TransactionClient,
  logoId?: string | null,
) {
  if (tx && logoId) {
    const file = await tx.fileAsset.findFirst({
      where: { id: logoId, deletedAt: null },
    });
    if (file?.mimeType === "image/webp")
      return `data:image/webp;base64,${(await readStored(file.storageKey)).toString("base64")}`;
  }
  const bytes = await readFile(
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public/brand/logo-mark.webp",
    ),
  );
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}
