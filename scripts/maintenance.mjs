// Run after a successful backup/restore check. Never removes permanent FileAsset objects.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { removeStored } from "../src/lib/storage.ts";
const db = new PrismaClient();
const cutoff = new Date(Date.now() - 86400000);
let uploads = 0;
try {
  const limits = await db.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  for (;;) {
    const batch = await db.uploadIntent.findMany({
      where: { expiresAt: { lt: cutoff } },
      take: 1000,
    });
    if (!batch.length) break;
    for (const intent of batch) {
      if (!/^q_[A-Za-z0-9_-]+$/.test(intent.storageKey))
        throw new Error("Refusing to remove a non-quarantine object.");
      try {
        await removeStored(intent.storageKey);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      await db.uploadIntent.delete({ where: { id: intent.id } });
      uploads++;
    }
  }
  console.log(
    JSON.stringify({
      expiredLimitBuckets: limits.count,
      expiredUploadIntents: uploads,
      permanentFilesRemoved: 0,
    }),
  );
} finally {
  await db.$disconnect();
}
