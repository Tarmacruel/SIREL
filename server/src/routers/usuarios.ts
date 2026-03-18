import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import {
  usuarioChangePasswordInputSchema,
  usuarioCreateInputSchema,
  usuarioListInputSchema,
  usuarioResetPasswordInputSchema,
  usuarioUpdateInputSchema,
} from "@sirel/shared/schemas/usuarios";

import { requireDb } from "../db/client.js";
import { logAuthEvent } from "../db/auth-log.js";
import { authLog, secretarias, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/auth-password.js";
import { adminProcedure, auditorProcedure, protectedProcedure, router } from "../trpc.js";

export const usuariosRouter = router({
  accessLog: auditorProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ input }) => {
      const db = requireDb();
      const limit = input?.limit ?? 30;

      return db
        .select({
          id: authLog.id,
          evento: authLog.evento,
          detalhe: authLog.detalhe,
          ipAddress: authLog.ipAddress,
          loginInformado: authLog.loginInformado,
          criadoEm: authLog.criadoEm,
          userId: authLog.userId,
          userName: users.name,
          username: users.username,
        })
        .from(authLog)
        .leftJoin(users, eq(users.id, authLog.userId))
        .orderBy(desc(authLog.criadoEm))
        .limit(limit);
    }),

  list: adminProcedure.input(usuarioListInputSchema.optional()).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [];

    if (input?.secretariaId) filters.push(eq(users.secretariaId, input.secretariaId));
    if (typeof input?.ativo === "boolean") filters.push(eq(users.ativo, input.ativo));
    if (input?.search) {
      filters.push(
        or(
          ilike(users.username, `%${input.search}%`),
          ilike(users.name, `%${input.search}%`),
          ilike(users.email, `%${input.search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    return db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        ativo: users.ativo,
        secretariaId: users.secretariaId,
        secretaria: secretarias.nome,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
      .where(whereClause)
      .orderBy(asc(users.name));
  }),

  create: adminProcedure.input(usuarioCreateInputSchema).mutation(async ({ input }) => {
    const db = requireDb();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
    if (existing.length) {
      throw new TRPCError({ code: "CONFLICT", message: "Ja existe um usuario com esse login." });
    }

    const [created] = await db
      .insert(users)
      .values({
        username: input.username.trim().toLowerCase(),
        name: input.name.trim(),
        email: input.email?.trim().toLowerCase() || null,
        loginMethod: "local_password",
        passwordHash: hashPassword(input.password),
        role: input.role,
        secretariaId: input.secretariaId ?? null,
        ativo: input.ativo,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        ativo: users.ativo,
        secretariaId: users.secretariaId,
      });

    return created;
  }),

  update: adminProcedure.input(usuarioUpdateInputSchema).mutation(async ({ input }) => {
    const db = requireDb();
    const [updated] = await db
      .update(users)
      .set({
        name: input.name.trim(),
        email: input.email?.trim().toLowerCase() || null,
        role: input.role,
        secretariaId: input.secretariaId ?? null,
        ativo: input.ativo,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId))
      .returning({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        ativo: users.ativo,
        secretariaId: users.secretariaId,
      });

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado." });
    }

    return updated;
  }),

  resetPassword: adminProcedure.input(usuarioResetPasswordInputSchema).mutation(async ({ input }) => {
    const db = requireDb();
    const [updated] = await db
      .update(users)
      .set({
        passwordHash: hashPassword(input.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId))
      .returning({ id: users.id, username: users.username });

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado." });
    }

    await logAuthEvent({
      userId: updated.id,
      loginInformado: updated.username,
      loginNormalizado: updated.username,
      evento: "PASSWORD_RESET",
      detalhe: "Senha redefinida por administrador.",
    });

    return updated;
  }),

  changePassword: protectedProcedure.input(usuarioChangePasswordInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Login obrigatorio." });
    }

    const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado." });
    }
    if (!verifyPassword(input.currentPassword, currentUser.passwordHash)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Senha atual invalida." });
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(input.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await logAuthEvent({
      userId,
      loginInformado: currentUser.username ?? currentUser.email ?? String(currentUser.id),
      loginNormalizado: currentUser.username ?? currentUser.email ?? String(currentUser.id),
      evento: "PASSWORD_CHANGE",
      detalhe: "Senha alterada pelo proprio usuario.",
    });

    return { success: true };
  }),
});
