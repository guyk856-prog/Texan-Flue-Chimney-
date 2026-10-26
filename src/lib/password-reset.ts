import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "./db";
import { hashToken, newToken, limit } from "./security";
import { sendReset } from "./mail";
import { HttpError } from "./errors";
export async function requestReset(raw: unknown) {
  const { email } = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((s) => s.toLowerCase()),
    })
    .strict()
    .parse(raw);
  limit(`reset:${email}`, 4);
  const user = await db.user.findFirst({
    where: { email, active: true, deletedAt: null },
  });
  if (user) {
    const token = newToken();
    const row = await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    try {
      await sendReset(
        email,
        `${process.env.AUTH_URL}/reset-password?token=${token}`,
      );
    } catch {
      await db.passwordResetToken.delete({ where: { id: row.id } });
      console.error("Password reset delivery failed");
    }
  }
  return { message: "If that account exists, a reset link has been sent." };
}
export async function resetPassword(raw: unknown) {
  const { token, password } = z
    .object({
      token: z.string().min(40).max(100),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine(
          (s) => Buffer.byteLength(s, "utf8") <= 72,
          "Password must be at most 72 UTF-8 bytes.",
        ),
    })
    .strict()
    .parse(raw);
  limit(`reset-token:${hashToken(token)}`, 5);
  const passwordHash = await hash(password, 12);
  await db.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !row ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      !row.user.active ||
      row.user.deletedAt
    )
      throw new HttpError(400, "Invalid or expired reset link.");
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new HttpError(400, "Invalid or expired reset link.");
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.auditLog.create({
      data: {
        organizationId: row.user.organizationId,
        userId: row.userId,
        entity: "User",
        entityId: row.userId,
        action: "PASSWORD_RESET",
      },
    });
  });
  return { message: "Password updated. Please sign in again." };
}
