import { and, eq, gte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { authLog, users } from "../db/schema.js";
import { logAuthEvent } from "../db/auth-log.js";
import { requireDb } from "../db/client.js";
import { createSessionToken } from "../lib/auth-session.js";
import { verifyPassword } from "../lib/auth-password.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

const LOGIN_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

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

function resolveClientIp(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  if (!value) return null;
  return value.split(",")[0]?.trim() || null;
}

export const authRouter = router({
  login: publicProcedure.input(loginInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const normalizedLogin = input.login.trim().toLowerCase();
    const ipAddress =
      resolveClientIp(ctx.req.headers["x-forwarded-for"]) ??
      resolveClientIp(ctx.req.socket.remoteAddress) ??
      "local";
    const lockoutCutoff = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000);

    const recentFailures = await db
      .select({ id: authLog.id })
      .from(authLog)
      .where(
        and(
          eq(authLog.loginNormalizado, normalizedLogin),
          eq(authLog.evento, "LOGIN_FAILURE"),
          gte(authLog.criadoEm, lockoutCutoff),
        ),
      )
      .limit(MAX_FAILED_ATTEMPTS);

    if (recentFailures.length >= MAX_FAILED_ATTEMPTS) {
      await logAuthEvent({
        loginInformado: input.login,
        loginNormalizado: normalizedLogin,
        ipAddress,
        evento: "LOGIN_BLOCKED",
        detalhe: `Bloqueio temporario apos ${MAX_FAILED_ATTEMPTS} tentativas invalidas em ${LOGIN_WINDOW_MINUTES} minutos.`,
      });

      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Login temporariamente bloqueado por ${LOGIN_WINDOW_MINUTES} minutos. Aguarde e tente novamente.`,
      });
    }

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
      await logAuthEvent({
        userId: user?.id ?? null,
        loginInformado: input.login,
        loginNormalizado: normalizedLogin,
        ipAddress,
        evento: "LOGIN_FAILURE",
        detalhe: "Credencial invalida no login local.",
      });

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

    await logAuthEvent({
      userId: user.id,
      loginInformado: input.login,
      loginNormalizado: normalizedLogin,
      ipAddress,
      evento: "LOGIN_SUCCESS",
      detalhe: "Login realizado com sucesso no ambiente local.",
    });

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
