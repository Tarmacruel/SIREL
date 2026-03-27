import { and, count, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";

import { auditoriaListInputSchema } from "@sirel/shared/schemas/auditoria";

import { requireDb } from "../db/client.js";
import {
  auditoriaLog,
  documentos,
  licitacaoChecklistExcecoes,
  licitacoes,
  prazosProcessuais,
  processos,
  users,
  workflowProcesso,
} from "../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

export const auditoriaRouter = router({
  summary: protectedProcedure.query(async () => {
    const db = requireDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalRow] = await db.select({ total: count() }).from(auditoriaLog);
    const [processRow] = await db.select({ total: count() }).from(auditoriaLog).where(eq(auditoriaLog.tabela, "processos"));
    const [documentRow] = await db.select({ total: count() }).from(auditoriaLog).where(eq(auditoriaLog.tabela, "documentos"));
    const [trackableRow] = await db
      .select({ total: count() })
      .from(auditoriaLog)
      .where(or(eq(auditoriaLog.acao, "CREATE"), eq(auditoriaLog.acao, "UPDATE"), eq(auditoriaLog.acao, "DELETE")));
    const [todayCountRow] = await db.select({ total: count() }).from(auditoriaLog).where(gte(auditoriaLog.criadoEm, todayStart));

    const recent = await db
      .select({
        id: auditoriaLog.id,
        tabela: auditoriaLog.tabela,
        acao: auditoriaLog.acao,
        descricao: auditoriaLog.descricao,
        criadoEm: auditoriaLog.criadoEm,
        usuarioNome: users.name,
      })
      .from(auditoriaLog)
      .leftJoin(users, eq(users.id, auditoriaLog.usuarioId))
      .where(or(eq(auditoriaLog.acao, "CREATE"), eq(auditoriaLog.acao, "UPDATE"), eq(auditoriaLog.acao, "DELETE")))
      .orderBy(desc(auditoriaLog.criadoEm))
      .limit(8);

    return {
      total: Number(totalRow?.total ?? 0),
      hoje: Number(todayCountRow?.total ?? 0),
      processos: Number(processRow?.total ?? 0),
      documentos: Number(documentRow?.total ?? 0),
      alteracoesRastreaveis: Number(trackableRow?.total ?? 0),
      recent,
    };
  }),

  list: protectedProcedure.input(auditoriaListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [];

    if (input.tabela) filters.push(eq(auditoriaLog.tabela, input.tabela));
    if (input.acao) filters.push(eq(auditoriaLog.acao, input.acao));
    if (input.usuarioId) filters.push(eq(auditoriaLog.usuarioId, input.usuarioId));
    if (input.search) {
      const pattern = `%${input.search}%`;
      filters.push(
        or(
          ilike(auditoriaLog.tabela, pattern),
          ilike(auditoriaLog.descricao, pattern),
          ilike(users.name, pattern),
        ),
      );
    }

    if (input.documentoId) {
      filters.push(and(eq(auditoriaLog.tabela, "documentos"), eq(auditoriaLog.registroId, input.documentoId)));
    }

    if (input.processoId) {
      const [wf] = await db.select({ id: workflowProcesso.id }).from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);
      const [lic] = await db.select({ id: licitacoes.id }).from(licitacoes).where(eq(licitacoes.processoId, input.processoId)).limit(1);
      const prazoIds = await db.select({ id: prazosProcessuais.id }).from(prazosProcessuais).where(eq(prazosProcessuais.processoId, input.processoId));
      const documentoIds = await db.select({ id: documentos.id }).from(documentos).where(eq(documentos.processoId, input.processoId));
      const checklistExcecaoIds = await db
        .select({ id: licitacaoChecklistExcecoes.id })
        .from(licitacaoChecklistExcecoes)
        .where(eq(licitacaoChecklistExcecoes.processoId, input.processoId));

      const relatedConditions = [
        and(eq(auditoriaLog.tabela, "processos"), eq(auditoriaLog.registroId, input.processoId)),
        wf ? and(eq(auditoriaLog.tabela, "workflow_processo"), or(eq(auditoriaLog.registroId, wf.id), eq(auditoriaLog.registroId, input.processoId))) : undefined,
        lic ? and(eq(auditoriaLog.tabela, "licitacoes"), eq(auditoriaLog.registroId, lic.id)) : undefined,
        prazoIds.length ? and(eq(auditoriaLog.tabela, "prazos_processuais"), inArray(auditoriaLog.registroId, prazoIds.map((item) => item.id))) : undefined,
        documentoIds.length ? and(eq(auditoriaLog.tabela, "documentos"), inArray(auditoriaLog.registroId, documentoIds.map((item) => item.id))) : undefined,
        checklistExcecaoIds.length
          ? and(eq(auditoriaLog.tabela, "licitacao_checklist_excecoes"), inArray(auditoriaLog.registroId, checklistExcecaoIds.map((item) => item.id)))
          : undefined,
      ].filter(Boolean) as any[];

      if (relatedConditions.length) {
        filters.push(or(...relatedConditions));
      } else {
        filters.push(and(eq(auditoriaLog.tabela, "processos"), eq(auditoriaLog.registroId, input.processoId)));
      }
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: auditoriaLog.id,
        tabela: auditoriaLog.tabela,
        registroId: auditoriaLog.registroId,
        acao: auditoriaLog.acao,
        descricao: auditoriaLog.descricao,
        dadosAnteriores: auditoriaLog.dadosAnteriores,
        dadosNovos: auditoriaLog.dadosNovos,
        criadoEm: auditoriaLog.criadoEm,
        usuarioId: auditoriaLog.usuarioId,
        usuarioNome: users.name,
      })
      .from(auditoriaLog)
      .leftJoin(users, eq(users.id, auditoriaLog.usuarioId))
      .where(whereClause)
      .orderBy(desc(auditoriaLog.criadoEm), desc(auditoriaLog.id))
      .limit(input.pageSize)
      .offset(offset);

    const [totalRow] = await db.select({ total: count() }).from(auditoriaLog).leftJoin(users, eq(users.id, auditoriaLog.usuarioId)).where(whereClause);

    const processIds = new Set<number>();
    const documentIds = rows.filter((row) => row.tabela === "documentos").map((row) => row.registroId);
    const licitacaoIds = rows.filter((row) => row.tabela === "licitacoes").map((row) => row.registroId);
    const prazoIds = rows.filter((row) => row.tabela === "prazos_processuais").map((row) => row.registroId);
    const workflowIds = rows.filter((row) => row.tabela === "workflow_processo").map((row) => row.registroId);
    const checklistExcecaoIds = rows.filter((row) => row.tabela === "licitacao_checklist_excecoes").map((row) => row.registroId);

    rows.forEach((row) => {
      if (row.tabela === "processos") processIds.add(row.registroId);
    });

    const documentoRows = documentIds.length
      ? await db.select({ id: documentos.id, titulo: documentos.titulo, processoId: documentos.processoId }).from(documentos).where(inArray(documentos.id, documentIds))
      : [];
    documentoRows.forEach((row) => processIds.add(row.processoId));

    const licitacaoRows = licitacaoIds.length
      ? await db.select({ id: licitacoes.id, processoId: licitacoes.processoId }).from(licitacoes).where(inArray(licitacoes.id, licitacaoIds))
      : [];
    licitacaoRows.forEach((row) => processIds.add(row.processoId));

    const prazoRows = prazoIds.length
      ? await db.select({ id: prazosProcessuais.id, processoId: prazosProcessuais.processoId, titulo: prazosProcessuais.titulo }).from(prazosProcessuais).where(inArray(prazosProcessuais.id, prazoIds))
      : [];
    prazoRows.forEach((row) => processIds.add(row.processoId));

    const workflowRows = workflowIds.length
      ? await db.select({ id: workflowProcesso.id, processoId: workflowProcesso.processoId }).from(workflowProcesso).where(inArray(workflowProcesso.id, workflowIds))
      : [];
    workflowRows.forEach((row) => processIds.add(row.processoId));

    const checklistExcecaoRows = checklistExcecaoIds.length
      ? await db
        .select({ id: licitacaoChecklistExcecoes.id, processoId: licitacaoChecklistExcecoes.processoId })
        .from(licitacaoChecklistExcecoes)
        .where(inArray(licitacaoChecklistExcecoes.id, checklistExcecaoIds))
      : [];
    checklistExcecaoRows.forEach((row) => processIds.add(row.processoId));

    const processoRows = processIds.size
      ? await db.select({ id: processos.id, numeroSirel: processos.numeroSirel, objeto: processos.objeto }).from(processos).where(inArray(processos.id, Array.from(processIds)))
      : [];

    const documentoMap = new Map(documentoRows.map((row) => [row.id, row]));
    const licitacaoMap = new Map(licitacaoRows.map((row) => [row.id, row]));
    const prazoMap = new Map(prazoRows.map((row) => [row.id, row]));
    const workflowMap = new Map(workflowRows.map((row) => [row.id, row]));
    const checklistExcecaoMap = new Map(checklistExcecaoRows.map((row) => [row.id, row]));
    const processoMap = new Map(processoRows.map((row) => [row.id, row]));

    return {
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total ?? 0),
      items: rows.map((row) => {
        const documento = documentoMap.get(row.registroId);
        const licitacao = licitacaoMap.get(row.registroId);
        const prazo = prazoMap.get(row.registroId);
        const workflow = workflowMap.get(row.registroId);
        const checklistExcecao = checklistExcecaoMap.get(row.registroId);
        const processoId =
          row.tabela === "processos"
            ? row.registroId
            : documento?.processoId ?? licitacao?.processoId ?? prazo?.processoId ?? workflow?.processoId ?? checklistExcecao?.processoId ?? null;
        const processo = processoId ? processoMap.get(processoId) : null;

        return {
          ...row,
          processoId,
          processoNumeroSirel: processo?.numeroSirel ?? null,
          processoObjeto: processo?.objeto ?? null,
          documentoId: documento?.id ?? (row.tabela === "documentos" ? row.registroId : null),
          documentoTitulo: documento?.titulo ?? null,
          prazoTitulo: prazo?.titulo ?? null,
        };
      }),
    };
  }),
});
