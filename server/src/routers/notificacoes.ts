import { and, count, desc, eq, gte, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { requireDb } from "../db/client.js";
import { notificacoesUsuario } from "../db/schema.js";
import { syncOperationalNotifications } from "../lib/notificacoes.js";
import { protectedProcedure, router } from "../trpc.js";

const notificationTypeSchema = z.enum(["PRAZO", "MOVIMENTACAO", "DOCUMENTO", "SISTEMA"]);
const notificationPrioritySchema = z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]);

function buildBaseFilters(userId: number, now: Date) {
  return [
    eq(notificacoesUsuario.userId, userId),
    or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
  ] as const;
}

export const notificacoesRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error("Usuário não autenticado para notificações.");
    }

    await syncOperationalNotifications(userId);

    const now = new Date();
    const [unreadRow, urgentRow, todayRow, totalRow] = await Promise.all([
      db
        .select({ total: count() })
        .from(notificacoesUsuario)
        .where(and(...buildBaseFilters(userId, now), eq(notificacoesUsuario.lida, false)))
        .then((result) => result[0]),
      db
        .select({ total: count() })
        .from(notificacoesUsuario)
        .where(
          and(
            ...buildBaseFilters(userId, now),
            eq(notificacoesUsuario.lida, false),
            or(eq(notificacoesUsuario.prioridade, "URGENTE"), eq(notificacoesUsuario.prioridade, "ALTA")),
          ),
        )
        .then((result) => result[0]),
      db
        .select({ total: count() })
        .from(notificacoesUsuario)
        .where(and(...buildBaseFilters(userId, now), gte(notificacoesUsuario.criadoEm, new Date(now.getFullYear(), now.getMonth(), now.getDate()))))
        .then((result) => result[0]),
      db
        .select({ total: count() })
        .from(notificacoesUsuario)
        .where(and(...buildBaseFilters(userId, now)))
        .then((result) => result[0]),
    ]);

    return {
      unread: Number(unreadRow?.total ?? 0),
      urgent: Number(urgentRow?.total ?? 0),
      today: Number(todayRow?.total ?? 0),
      total: Number(totalRow?.total ?? 0),
    };
  }),

  list: protectedProcedure
    .input(
      z.object({
        search: z.string().trim().optional(),
        type: notificationTypeSchema.optional(),
        priority: notificationPrioritySchema.optional(),
        unreadOnly: z.boolean().optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(50).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = requireDb();
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error("Usuário não autenticado para notificações.");
      }

      await syncOperationalNotifications(userId);

      const now = new Date();
      const filters = [...buildBaseFilters(userId, now)];

      if (input.unreadOnly) filters.push(eq(notificacoesUsuario.lida, false));
      if (input.type) filters.push(eq(notificacoesUsuario.tipo, input.type));
      if (input.priority) filters.push(eq(notificacoesUsuario.prioridade, input.priority));
      if (input.search) {
        const pattern = `%${input.search}%`;
        filters.push(or(ilike(notificacoesUsuario.titulo, pattern), ilike(notificacoesUsuario.mensagem, pattern)));
      }

      const whereClause = and(...filters);
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRow, unreadRow, urgentRow, todayRow] = await Promise.all([
        db
          .select({
            id: notificacoesUsuario.id,
            type: notificacoesUsuario.tipo,
            priority: notificacoesUsuario.prioridade,
            title: notificacoesUsuario.titulo,
            message: notificacoesUsuario.mensagem,
            href: notificacoesUsuario.href,
            read: notificacoesUsuario.lida,
            processId: notificacoesUsuario.processoId,
            documentoId: notificacoesUsuario.documentoId,
            createdAt: notificacoesUsuario.criadoEm,
            updatedAt: notificacoesUsuario.atualizadoEm,
          })
          .from(notificacoesUsuario)
          .where(whereClause)
          .orderBy(notificacoesUsuario.lida, desc(notificacoesUsuario.prioridade), desc(notificacoesUsuario.atualizadoEm), desc(notificacoesUsuario.id))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ total: count() }).from(notificacoesUsuario).where(whereClause).then((result) => result[0]),
        db
          .select({ total: count() })
          .from(notificacoesUsuario)
          .where(and(...buildBaseFilters(userId, now), eq(notificacoesUsuario.lida, false)))
          .then((result) => result[0]),
        db
          .select({ total: count() })
          .from(notificacoesUsuario)
          .where(and(...buildBaseFilters(userId, now), eq(notificacoesUsuario.lida, false), or(eq(notificacoesUsuario.prioridade, "URGENTE"), eq(notificacoesUsuario.prioridade, "ALTA"))))
          .then((result) => result[0]),
        db
          .select({ total: count() })
          .from(notificacoesUsuario)
          .where(and(...buildBaseFilters(userId, now), gte(notificacoesUsuario.criadoEm, new Date(now.getFullYear(), now.getMonth(), now.getDate()))))
          .then((result) => result[0]),
      ]);

      return {
        items: rows,
        page: input.page,
        pageSize: input.pageSize,
        total: Number(totalRow?.total ?? 0),
        totalPages: Math.max(1, Math.ceil(Number(totalRow?.total ?? 0) / input.pageSize)),
        summary: {
          unread: Number(unreadRow?.total ?? 0),
          urgent: Number(urgentRow?.total ?? 0),
          today: Number(todayRow?.total ?? 0),
        },
      };
    }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error("Usuário não autenticado para notificações.");
      }

      await db
        .update(notificacoesUsuario)
        .set({
          lida: true,
          atualizadoEm: new Date(),
        })
        .where(and(eq(notificacoesUsuario.id, input.notificationId), eq(notificacoesUsuario.userId, userId)));

      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error("Usuário não autenticado para notificações.");
    }

    await db
      .update(notificacoesUsuario)
      .set({
        lida: true,
        atualizadoEm: new Date(),
      })
      .where(and(...buildBaseFilters(userId, new Date()), eq(notificacoesUsuario.lida, false)));

    return { success: true };
  }),
});
