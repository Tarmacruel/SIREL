import { and, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { users } from "../db/schema.js";
import { requireDb } from "../db/client.js";
import { createSessionToken } from "../lib/auth-session.js";
import { verifyPassword } from "../lib/auth-password.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

const loginInputSchema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(6).max(120),
});

function toSessionUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username || row.email || `user-${row.id}`,
    name: row.name,
    email: row.email ?? null,
    role: row.role,
    secretariaId: row.secretariaId ?? null,
  };
}

export const authRouter = router({
  login: publicProcedure.input(loginInputSchema).mutation(async ({ input }) => {
    const db = requireDb();
    const normalizedLogin = input.login.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.ativo, true),
          or(eq(users.username, normalizedLogin), eq(users.email, normalizedLogin)),
        ),
      )
      .limit(1);

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Usuario ou senha invalidos",
      });
    }

    const sessionUser = toSessionUser(user);
    const token = createSessionToken(sessionUser);

    await db
      .update(users)
      .set({
        lastSignedIn: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      token,
      user: sessionUser,
    };
  }),

  me: protectedProcedure.query(({ ctx }) => ({
    user: {
      id: ctx.user!.id,
      username: ctx.user!.username,
      name: ctx.user!.name,
      email: ctx.user!.email,
      role: ctx.user!.role,
      secretariaId: ctx.user!.secretariaId ?? null,
    },
  })),
});
