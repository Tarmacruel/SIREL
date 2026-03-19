import { and, count, desc, eq, gte, inArray, isNull, lt, lte, or, sum } from "drizzle-orm";
import { z } from "zod";

import { requireDb } from "../db/client.js";
import {
  contratos,
  notificacoesUsuario,
  processos,
  prazosProcessuais,
  workflowProcesso,
} from "../db/schema.js";
import { syncOperationalNotifications } from "../lib/notificacoes.js";
import { protectedProcedure, router } from "../trpc.js";

function formatDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const priorityRank = {
  URGENTE: 4,
  ALTA: 3,
  MEDIA: 2,
  BAIXA: 1,
} as const;

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error("Usuário não autenticado para o dashboard.");
    }

    await syncOperationalNotifications(userId);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const today = formatDateString(todayStart);
    const limit48h = formatDateString(addDays(todayStart, 2));
    const weekLimit = formatDateString(addDays(todayStart, 7));

    const [
      processosAtivosRow,
      contratosVigentesRow,
      valorGlobalEstimadoRow,
      prazosHojeRow,
      prazos48hRow,
      prazosAtrasadosRow,
      prazosSemanaRow,
      porModulo,
      unreadNotificationsRow,
      notificationsRows,
    ] = await Promise.all([
      db.select({ total: count() }).from(processos).where(eq(processos.finalizado, false)).then((rows) => rows[0]),
      db.select({ total: count() }).from(contratos).where(eq(contratos.status, "ATIVO")).then((rows) => rows[0]),
      db.select({ total: sum(processos.valorEstimado) }).from(processos).then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(and(eq(prazosProcessuais.status, "PENDENTE"), eq(prazosProcessuais.dataPrevista, today)))
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(
          and(
            inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
            gte(prazosProcessuais.dataPrevista, today),
            lte(prazosProcessuais.dataPrevista, limit48h),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), lt(prazosProcessuais.dataPrevista, today)))
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(
          and(
            inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
            gte(prazosProcessuais.dataPrevista, today),
            lte(prazosProcessuais.dataPrevista, weekLimit),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({ modulo: workflowProcesso.moduloAtual, total: count() })
        .from(workflowProcesso)
        .groupBy(workflowProcesso.moduloAtual),
      db
        .select({ total: count() })
        .from(notificacoesUsuario)
        .where(
          and(
            eq(notificacoesUsuario.userId, userId),
            eq(notificacoesUsuario.lida, false),
            or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({
          id: notificacoesUsuario.id,
          type: notificacoesUsuario.tipo,
          priority: notificacoesUsuario.prioridade,
          title: notificacoesUsuario.titulo,
          message: notificacoesUsuario.mensagem,
          processId: notificacoesUsuario.processoId,
          documentoId: notificacoesUsuario.documentoId,
          href: notificacoesUsuario.href,
          read: notificacoesUsuario.lida,
          createdAt: notificacoesUsuario.criadoEm,
        })
        .from(notificacoesUsuario)
        .where(
          and(
            eq(notificacoesUsuario.userId, userId),
            or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
          ),
        )
        .orderBy(desc(notificacoesUsuario.atualizadoEm), desc(notificacoesUsuario.id))
        .limit(20),
    ]);

    const agendaHoje = await db
      .select({
        id: prazosProcessuais.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        titulo: prazosProcessuais.titulo,
        tipo: prazosProcessuais.tipo,
        dataPrevista: prazosProcessuais.dataPrevista,
        status: prazosProcessuais.status,
      })
      .from(prazosProcessuais)
      .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
      .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), lte(prazosProcessuais.dataPrevista, limit48h)))
      .orderBy(prazosProcessuais.dataPrevista, processos.numeroSirel)
      .limit(8);

    const notifications = [...notificationsRows]
      .sort((left, right) => {
        if (left.read !== right.read) return Number(left.read) - Number(right.read);
        const byPriority = priorityRank[right.priority] - priorityRank[left.priority];
        if (byPriority !== 0) return byPriority;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      })
      .slice(0, 10);

    return {
      processosAtivos: Number(processosAtivosRow?.total ?? 0),
      contratosVigentes: Number(contratosVigentesRow?.total ?? 0),
      valorGlobalEstimado: Number(valorGlobalEstimadoRow?.total ?? 0),
      prazosHoje: Number(prazosHojeRow?.total ?? 0),
      prazos48h: Number(prazos48hRow?.total ?? 0),
      prazosAtrasados: Number(prazosAtrasadosRow?.total ?? 0),
      prazosSemana: Number(prazosSemanaRow?.total ?? 0),
      notificacoesPendentes: Number(unreadNotificationsRow?.total ?? 0),
      porModulo: porModulo.map((row) => ({ modulo: row.modulo, total: Number(row.total) })),
      agendaHoje,
      notifications,
    };
  }),

  markNotificationRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error("Usuário não autenticado para leitura de notificações.");
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

  markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error("Usuário não autenticado para leitura de notificações.");
    }

    await db
      .update(notificacoesUsuario)
      .set({
        lida: true,
        atualizadoEm: new Date(),
      })
      .where(and(eq(notificacoesUsuario.userId, userId), eq(notificacoesUsuario.lida, false)));

    return { success: true };
  }),
});
