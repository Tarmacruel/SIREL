import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { workflowListInputSchema, workflowMoveInputSchema, workflowPublishInputSchema } from "@sirel/shared/schemas/workflow";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  documentos,
  modalidades,
  movimentacoesWorkflow,
  pessoas,
  processos,
  licitacoes,
  secretarias,
  statusProcesso,
  workflowProcesso,
} from "../db/schema.js";
import { getNextNumeroEdital } from "../lib/processo-identity.js";
import { operadorProcedure, publicProcedure, router } from "../trpc.js";

export const workflowRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const [totalRow] = await db
      .select({ total: count() })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .where(eq(processos.ativo, true));
    const porModulo = await db
      .select({ modulo: workflowProcesso.moduloAtual, total: count() })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .where(eq(processos.ativo, true))
      .groupBy(workflowProcesso.moduloAtual);
    const porSituacao = await db
      .select({ situacao: workflowProcesso.situacao, total: count() })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .where(eq(processos.ativo, true))
      .groupBy(workflowProcesso.situacao);
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recentRow] = await db
      .select({ total: count() })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .where(and(eq(processos.ativo, true), gte(workflowProcesso.atualizadoEm, recentCutoff)));

    return {
      total: Number(totalRow?.total ?? 0),
      porModulo: porModulo.map((row) => ({ modulo: row.modulo, total: Number(row.total) })),
      porSituacao: porSituacao.map((row) => ({ situacao: row.situacao, total: Number(row.total) })),
      atualizadosUltimos7Dias: Number(recentRow?.total ?? 0),
      referenciaAtualizacao: recentCutoff.toISOString(),
    };
  }),

  list: publicProcedure.input(workflowListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [];

    if (input.moduloAtual) filters.push(eq(workflowProcesso.moduloAtual, input.moduloAtual as never));
    if (input.situacao) filters.push(eq(workflowProcesso.situacao, input.situacao as never));
    if (input.search) {
      filters.push(
        or(
          ilike(processos.numeroSirel, `%${input.search}%`),
          ilike(processos.objeto, `%${input.search}%`),
          ilike(secretarias.nome, `%${input.search}%`),
          ilike(workflowProcesso.etapaAtual, `%${input.search}%`),
        ),
      );
    }

    filters.push(eq(processos.ativo, true));
    const whereClause = and(...filters);

    const items = await db
      .select({
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroEdital: processos.numeroEdital,
        secretaria: secretarias.nome,
        modalidade: modalidades.nome,
        statusProcesso: statusProcesso.nome,
        moduloAtual: workflowProcesso.moduloAtual,
        situacao: workflowProcesso.situacao,
        etapaAtual: workflowProcesso.etapaAtual,
        dataInicio: workflowProcesso.dataInicio,
        dataConclusao: workflowProcesso.dataConclusao,
        atualizadoEm: workflowProcesso.atualizadoEm,
        valorEstimado: processos.valorEstimado,
        dataAbertura: processos.dataAbertura,
        objeto: processos.objeto,
        foraDoFluxo: processos.foraDoFluxo,
        publicado: processos.publicado,
      })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
      .where(whereClause)
      .orderBy(desc(workflowProcesso.atualizadoEm))
      .limit(input.pageSize)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .where(whereClause);

    const processoIds = items.map((row) => row.processoId);
    const docCounts = processoIds.length
      ? await db
          .select({ processoId: documentos.processoId, total: count() })
          .from(documentos)
          .where(inArray(documentos.processoId, processoIds))
          .groupBy(documentos.processoId)
      : [];
    const docMap = new Map(docCounts.map((row) => [row.processoId, Number(row.total)]));

    const movementRows = processoIds.length
      ? await db
          .select({
            processoId: movimentacoesWorkflow.processoId,
            descricao: movimentacoesWorkflow.descricao,
            moduloDestino: movimentacoesWorkflow.moduloDestino,
            criadoEm: movimentacoesWorkflow.criadoEm,
          })
          .from(movimentacoesWorkflow)
          .where(inArray(movimentacoesWorkflow.processoId, processoIds))
          .orderBy(desc(movimentacoesWorkflow.criadoEm))
      : [];
    const latestMovementMap = new Map<number, (typeof movementRows)[number]>();
    for (const row of movementRows) {
      if (!latestMovementMap.has(row.processoId)) {
        latestMovementMap.set(row.processoId, row);
      }
    }

    return {
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total ?? 0),
      items: items.map((row) => ({
        ...row,
        documentos: docMap.get(row.processoId) ?? 0,
        ultimaMovimentacao: latestMovementMap.get(row.processoId) ?? null,
      })),
    };
  }),

  byProcesso: publicProcedure.input(z.object({ processoId: z.number().int().positive() })).query(async ({ input }) => {
    const db = requireDb();
    const [processo] = await db
      .select({
        id: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroEdital: processos.numeroEdital,
        objeto: processos.objeto,
        secretaria: secretarias.nome,
        modalidade: modalidades.nome,
        statusProcesso: statusProcesso.nome,
        valorEstimado: processos.valorEstimado,
        dataAbertura: processos.dataAbertura,
        foraDoFluxo: processos.foraDoFluxo,
        ativo: processos.ativo,
        condutorProcessoId: processos.condutorProcessoId,
        publicado: processos.publicado,
      })
      .from(processos)
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
      .where(eq(processos.id, input.processoId))
      .limit(1);
    const [estado] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);
    const historico = await db
      .select()
      .from(movimentacoesWorkflow)
      .where(eq(movimentacoesWorkflow.processoId, input.processoId))
      .orderBy(desc(movimentacoesWorkflow.criadoEm));
    const [docsRow] = await db.select({ total: count() }).from(documentos).where(eq(documentos.processoId, input.processoId));
    const [condutor] = processo?.condutorProcessoId
      ? await db
          .select({ id: pessoas.id, nome: pessoas.nome, cargo: pessoas.cargo })
          .from(pessoas)
          .where(eq(pessoas.id, processo.condutorProcessoId))
          .limit(1)
      : [];

    return {
      processo: processo
        ? {
            ...processo,
            condutorProcesso: condutor ?? null,
          }
        : null,
      estado: estado ?? null,
      historico,
      documentos: Number(docsRow?.total ?? 0),
    };
  }),

  move: operadorProcedure.input(workflowMoveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [currentState] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);
    const [currentProcess] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);

    if (!currentProcess) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado." });
    }

    const nextData = {
      moduloAtual: input.moduloDestino,
      situacao: input.situacao,
      etapaAtual: input.etapaAtual,
      dataInicio: currentState?.dataInicio ?? new Date().toISOString().slice(0, 10),
      dataConclusao: input.situacao === "CONCLUIDO" ? new Date().toISOString().slice(0, 10) : null,
      atualizadoEm: new Date(),
    };

    if (currentState) {
      await db.update(workflowProcesso).set(nextData).where(eq(workflowProcesso.processoId, input.processoId));
    } else {
      await db.insert(workflowProcesso).values({
        processoId: input.processoId,
        criadoEm: new Date(),
        ...nextData,
      });
    }

    const processPatch: Record<string, unknown> = {
      atualizadoEm: new Date(),
    };

    if (input.statusId) {
      processPatch.statusId = input.statusId;
    }

    if (input.moduloDestino === "LICITACAO") {
      const [licitacaoAtual] = await db.select().from(licitacoes).where(eq(licitacoes.processoId, input.processoId)).limit(1);
      if (!licitacaoAtual) {
        await db.insert(licitacoes).values({
          processoId: input.processoId,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        });
      }
    }

    await db.update(processos).set(processPatch).where(eq(processos.id, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: currentState?.moduloAtual ?? "SISTEMA",
      moduloDestino: input.moduloDestino,
      descricao: input.descricao ?? `Processo movido para ${input.moduloDestino}`,
      observacao: input.observacao || null,
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "workflow_processo",
      registroId: currentState?.id ?? input.processoId,
      acao: currentState ? "UPDATE" : "CREATE",
      dadosAnteriores: currentState ?? null,
      dadosNovos: nextData,
      descricao: `Workflow do processo ${input.processoId} atualizado para ${input.moduloDestino}`,
    });

    const [updatedState] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);
    return updatedState ?? null;
  }),

  publish: operadorProcedure.input(workflowPublishInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [currentState] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);
    const [currentProcess] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);

    if (!currentProcess) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado." });
    }
    if (currentState?.moduloAtual !== "LICITACAO") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A publicação só pode ocorrer para processos em Licitação." });
    }
    if (!currentProcess.modalidadeId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Defina a modalidade antes de publicar o processo." });
    }

    const [modalidade] = await db.select({ codigo: modalidades.codigo }).from(modalidades).where(eq(modalidades.id, currentProcess.modalidadeId)).limit(1);
    if (!modalidade?.codigo) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Modalidade inválida para gerar o número do edital." });
    }

    const numeroEdital = currentProcess.numeroEdital ?? (await getNextNumeroEdital(db, currentProcess.anoReferencia, modalidade.codigo));

    await db
      .update(processos)
      .set({
        numeroEdital,
        condutorProcessoId: input.condutorProcessoId,
        publicado: true,
        statusId: input.statusId ?? currentProcess.statusId,
        atualizadoEm: new Date(),
      })
      .where(eq(processos.id, input.processoId));

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: "Publicidade / aviso publicado",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    const [licitacaoAtual] = await db.select().from(licitacoes).where(eq(licitacoes.processoId, input.processoId)).limit(1);
    if (licitacaoAtual) {
      await db.update(licitacoes).set({
        statusLicitacao: "RECEBIMENTO_PROPOSTAS",
        dataPublicacaoEdital: licitacaoAtual.dataPublicacaoEdital ?? new Date(),
        atualizadoEm: new Date(),
      }).where(eq(licitacoes.id, licitacaoAtual.id));
    } else {
      await db.insert(licitacoes).values({
        processoId: input.processoId,
        statusLicitacao: "RECEBIMENTO_PROPOSTAS",
        dataPublicacaoEdital: new Date(),
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });
    }

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "LICITACAO",
      moduloDestino: "LICITACAO",
      descricao: input.descricao ?? `Processo publicado com edital ${numeroEdital}`,
      observacao: input.observacao || null,
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "processos",
      registroId: input.processoId,
      acao: "UPDATE",
      dadosAnteriores: currentProcess,
      dadosNovos: { numeroEdital, condutorProcessoId: input.condutorProcessoId, publicado: true },
      descricao: `Processo ${currentProcess.numeroSirel} publicado`,
    });

    const [updatedProcess] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);
    return updatedProcess ?? null;
  }),
});
