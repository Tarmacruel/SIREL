import { TRPCError } from "@trpc/server";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import {
  usuarioChangePasswordInputSchema,
  usuarioCreateInputSchema,
  usuarioListInputSchema,
  usuarioResetPasswordInputSchema,
  usuarioUpdateInputSchema,
} from "@sirel/shared/schemas/usuarios";

import { requireDb } from "../db/client.js";
import { secretarias, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/auth-password.js";
import { adminProcedure, protectedProcedure, router } from "../trpc.js";

export const usuariosRouter = router({
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

    return { success: true };
  }),
});
