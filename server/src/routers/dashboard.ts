import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { requireDb } from "../db/client.js";
import {
  contratos,
  modalidades,
  movimentacoesWorkflow,
  notificacoesUsuario,
  pessoas,
  processos,
  prazosProcessuais,
  secretarias,
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

export const dashboardRouter = router({
  summary: protectedProcedure
    .input(
      z.object({
        ano: z.number().int().min(2000).max(2100).nullable().optional(),
        modalidadeId: z.number().int().optional(),
        condutorId: z.number().int().optional(),
        secretariaId: z.number().int().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error("Usuário não autenticado para o dashboard.");
    }

    await syncOperationalNotifications(userId);

    const now = new Date();
    const filterYear = input?.ano;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const recentMovementWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const today = formatDateString(todayStart);
    const limit24h = formatDateString(addDays(todayStart, 1));
    const limit48h = formatDateString(addDays(todayStart, 2));
    const monthWindowStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - 5, 1);

    const processYearFilter = filterYear ? eq(processos.anoReferencia, filterYear) : undefined;
    const condicaoModalidade = input?.modalidadeId ? eq(processos.modalidadeId, input.modalidadeId) : undefined;
    const condicaoCondutor = input?.condutorId ? eq(processos.condutorProcessoId, input?.condutorId) : undefined;
    const condicaoSecretaria = input?.secretariaId ? eq(processos.secretariaId, input.secretariaId) : undefined;
    const processFilter = processYearFilter || condicaoModalidade || condicaoCondutor || condicaoSecretaria
      ? and(
          ...(processYearFilter ? [processYearFilter] : []),
          ...(condicaoModalidade ? [condicaoModalidade] : []),
          ...(condicaoCondutor ? [condicaoCondutor] : []),
          ...(condicaoSecretaria ? [condicaoSecretaria] : []),
        )
      : undefined;

    const [
      processosAtivosRow,
      contratosVigentesRow,
      valorGlobalEstimadoRow,
      prazosHojeRow,
      prazos24hRow,
      prazos48hRow,
      prazosAtrasadosRow,
      tarefasPendentesRow,
      movimentacoesUltimas24hRow,
      porModuloRows,
      processosPorSecretariaRows,
      modalidadesMaisUtilizadasRows,
      evolucaoMensalRows,
      minhaAgendaRows,
      rankingCondutoresRows,
      agendaCriticaRows,
      movimentacoesRecentesRows,
    ] = await Promise.all([
      // Processos ativos (filtrar por ano de referencia do número do processo)
      db
        .select({ total: count() })
        .from(processos)
        .where(and(eq(processos.finalizado, false), ...(processFilter ? [processFilter] : [])))
        .then((rows) => rows[0]),
      db.select({ total: count() }).from(contratos).where(eq(contratos.status, "ATIVO")).then((rows) => rows[0]),
      // Valor global (filtrar por ano de referencia do número do processo)
      db
        .select({ total: sum(processos.valorEstimado) })
        .from(processos)
        .where(processFilter)
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), eq(prazosProcessuais.dataPrevista, today)))
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(
          and(
            inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
            gte(prazosProcessuais.dataPrevista, today),
            lte(prazosProcessuais.dataPrevista, limit24h),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(
          and(
            inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
            gte(prazosProcessuais.dataPrevista, formatDateString(addDays(todayStart, 2))),
            lte(prazosProcessuais.dataPrevista, limit48h),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), sql`${prazosProcessuais.dataPrevista} < ${today}`))
        .then((rows) => rows[0]),
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
        .select({ total: count() })
        .from(movimentacoesWorkflow)
        .where(gte(movimentacoesWorkflow.criadoEm, recentMovementWindow))
        .then((rows) => rows[0]),
      db
        .select({ modulo: workflowProcesso.moduloAtual, total: count() })
        .from(workflowProcesso)
        .groupBy(workflowProcesso.moduloAtual),
      db
        .select({ secretariaId: secretarias.id, secretaria: secretarias.nome, total: count() })
        .from(processos)
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .where(and(eq(processos.finalizado, false), ...(processFilter ? [processFilter] : [])))
        .groupBy(secretarias.id, secretarias.nome)
        .orderBy(desc(count()), secretarias.nome)
        .limit(6),
      db
        .select({ modalidadeId: modalidades.id, modalidade: modalidades.nome, total: count() })
        .from(processos)
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .where(processFilter)
        .groupBy(modalidades.id, modalidades.nome)
        .orderBy(desc(count()), modalidades.nome)
        .limit(6),
      db
        .select({
          referencia: sql<string>`to_char(date_trunc('month', ${processos.criadoEm}), 'YYYY-MM')`,
          mes: sql<string>`to_char(date_trunc('month', ${processos.criadoEm}), 'MM/YYYY')`,
          total: count(),
        })
        .from(processos)
        .where(processFilter)
        .groupBy(sql`date_trunc('month', ${processos.criadoEm})`)
        .orderBy(sql`date_trunc('month', ${processos.criadoEm})`),
      db
        .select({
          id: notificacoesUsuario.id,
          type: notificacoesUsuario.tipo,
          priority: notificacoesUsuario.prioridade,
          title: notificacoesUsuario.titulo,
          message: notificacoesUsuario.mensagem,
          href: notificacoesUsuario.href,
          read: notificacoesUsuario.lida,
          createdAt: notificacoesUsuario.criadoEm,
        })
        .from(notificacoesUsuario)
        .where(
          and(
            eq(notificacoesUsuario.userId, userId),
            eq(notificacoesUsuario.lida, false),
            or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
          ),
        )
        .orderBy(desc(notificacoesUsuario.prioridade), desc(notificacoesUsuario.atualizadoEm), desc(notificacoesUsuario.id))
        .limit(5),
      db
        .select({
          condutorId: pessoas.id,
          condutor: pessoas.nome,
          total: count(),
        })
        .from(processos)
        .innerJoin(pessoas, eq(pessoas.id, processos.condutorProcessoId))
        .where(processFilter)
        .groupBy(pessoas.id, pessoas.nome)
        .orderBy(desc(count()), pessoas.nome)
        .limit(5),
      db
        .select({
          id: prazosProcessuais.id,
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          objeto: processos.objeto,
          titulo: prazosProcessuais.titulo,
          tipo: prazosProcessuais.tipo,
          dataPrevista: prazosProcessuais.dataPrevista,
          status: prazosProcessuais.status,
        })
        .from(prazosProcessuais)
        .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
        .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), lte(prazosProcessuais.dataPrevista, limit48h)))
        .orderBy(prazosProcessuais.dataPrevista, processos.numeroSirel)
        .limit(8),
      db
        .select({
          id: movimentacoesWorkflow.id,
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          descricao: movimentacoesWorkflow.descricao,
          moduloDestino: movimentacoesWorkflow.moduloDestino,
          criadoEm: movimentacoesWorkflow.criadoEm,
        })
        .from(movimentacoesWorkflow)
        .innerJoin(processos, eq(processos.id, movimentacoesWorkflow.processoId))
        .orderBy(desc(movimentacoesWorkflow.criadoEm), desc(movimentacoesWorkflow.id))
        .limit(8),
    ]);

    return {
      processosAtivos: Number(processosAtivosRow?.total ?? 0),
      contratosVigentes: Number(contratosVigentesRow?.total ?? 0),
      valorGlobalEstimado: Number(valorGlobalEstimadoRow?.total ?? 0),
      prazosHoje: Number(prazosHojeRow?.total ?? 0),
      prazos24h: Number(prazos24hRow?.total ?? 0),
      prazos48h: Number(prazos48hRow?.total ?? 0),
      prazosAtrasados: Number(prazosAtrasadosRow?.total ?? 0),
      tarefasPendentesUsuario: Number(tarefasPendentesRow?.total ?? 0),
      movimentacoesUltimas24h: Number(movimentacoesUltimas24hRow?.total ?? 0),
      porModulo: porModuloRows.map((row) => ({ modulo: row.modulo, total: Number(row.total) })),
      processosPorSecretaria: processosPorSecretariaRows.map((row) => ({ secretariaId: row.secretariaId, secretaria: row.secretaria, total: Number(row.total) })),
      modalidadesMaisUtilizadas: modalidadesMaisUtilizadasRows.map((row) => ({ modalidadeId: row.modalidadeId ?? null, modalidade: row.modalidade ?? "Sem modalidade", total: Number(row.total) })),
      evolucaoMensal: evolucaoMensalRows.map((row) => ({ referencia: row.referencia, mes: row.mes, total: Number(row.total) })),
      rankingCondutores: rankingCondutoresRows.map((row) => ({ condutorId: row.condutorId ?? null, condutor: row.condutor, total: Number(row.total) })),
      minhaAgenda: minhaAgendaRows,
      agendaCritica: agendaCriticaRows,
      ultimasMovimentacoes: movimentacoesRecentesRows,
    };
  }),
});

