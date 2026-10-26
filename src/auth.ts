import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken, newToken, limit } from "@/lib/security";
const login = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z
    .string()
    .min(1)
    .max(72)
    .refine((s) => Buffer.byteLength(s, "utf8") <= 72),
});
export const { handlers, auth, signIn, signOut } = NextAuth({
  useSecureCookies: process.env.AUTH_URL?.startsWith("https://"),
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = login.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        limit(`login:${email}`);
        const user = await db.user.findUnique({ where: { email } });
        // A valid fixed hash keeps unknown-user password work comparable.
        const valid = await compare(
          password,
          user?.passwordHash ??
            "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5NZYQvQ8qYjA5Q3jL5/S1wV2uK8Qd4K",
        );
        if (!valid || !user || !user.active || user.deletedAt) return null;
        const sessionHandle = newToken();
        await db.$transaction([
          db.session.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(sessionHandle),
              expiresAt: new Date(Date.now() + 8 * 3600_000),
            },
          }),
          db.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          }),
        ]);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sessionHandle,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user)
        token.sessionHandle = (
          user as typeof user & { sessionHandle: string }
        ).sessionHandle;
      return token;
    },
    async session({ session, token }) {
      const row =
        typeof token.sessionHandle === "string"
          ? await db.session.findUnique({
              where: { tokenHash: hashToken(token.sessionHandle) },
              include: { user: true },
            })
          : null;
      session.user.id =
        row &&
        row.expiresAt > new Date() &&
        row.user.active &&
        !row.user.deletedAt
          ? row.user.id
          : "";
      return session;
    },
  },
  events: {
    async signOut(message) {
      if (
        "token" in message &&
        typeof message.token?.sessionHandle === "string"
      )
        await db.session.deleteMany({
          where: { tokenHash: hashToken(message.token.sessionHandle) },
        });
    },
  },
});
