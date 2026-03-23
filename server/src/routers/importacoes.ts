import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

import {
  importacaoBllAutoReconcileInputSchema,
  importacaoBllCsvInputSchema,
  importacaoBllDeleteProcessoInputSchema,
  importacaoBllDeleteProcessosInputSchema,
  importacaoBllDetailInputSchema,
  importacaoBllExecutionListInputSchema,
  importacaoBllLinkProcessoInputSchema,
  importacaoBllListInputSchema,
  importacaoBllRemoteSyncInputSchema,
  importacaoBllSearchProcessosInputSchema,
  importacaoBllSetIgnoredInputSchema,
  importacaoBllUnlinkProcessoInputSchema,
} from "@sirel/shared/schemas/importacoes";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  importacaoBllExecucoes,
  importacaoBllItens,
  importacaoBllProcessos,
  processos,
  workflowProcesso,
} from "../db/schema.js";
import {
  autoReconcileImportedProcesses,
  getConciliationSummaryCounts,
  getConciliationSuggestions,
  getLinkedInternalProcess,
  linkImportedProcessToInternal,
  setImportedProcessIgnored,
  unlinkImportedProcess,
  deleteImportedProcess,
  deleteImportedProcesses,
} from "../lib/importacoes-conciliacao.js";
import {
  executeAutomaticPncpConciliation,
  generatePncpConciliationSuggestions,
  getPncpProcessDetails,
  searchPncpProcesses,
} from "../lib/importacoes-pncp.js";
import {
  getImportSchedulerConfig,
  getImportSummaryCounts,
  importCsvBundle,
  remoteImportSources,
  syncAllRemoteImports,
  syncRemoteImport,
} from "../lib/importacoes-bll.js";
import { operadorProcedure, protectedProcedure, router } from "../trpc.js";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const importacoesRouter = router({
  summary: protectedProcedure.query(async () => {
    const { processRows, executionRows } = await getImportSummaryCounts();
    const conciliation = await getConciliationSummaryCounts();
    const counts = {
      LICITACAO: { registros: 0, itens: 0 },
      COMPRA_DIRETA: { registros: 0, itens: 0 },
    };

    for (const row of processRows) {
      counts[row.origem] = {
        registros: Number(row.total ?? 0),
        itens: Number(row.itens ?? 0),
      };
    }

    const lastSuccessfulBySource = {
      LICITACAO:
        executionRows.find(
          (row) => row.origem === "LICITACAO" && row.status === "CONCLUIDA",
        ) ?? null,
      COMPRA_DIRETA:
        executionRows.find(
          (row) => row.origem === "COMPRA_DIRETA" && row.status === "CONCLUIDA",
        ) ?? null,
    };

    return {
      counts,
      lastExecution: executionRows[0] ?? null,
      lastSuccessfulBySource,
      conciliation,
      scheduler: getImportSchedulerConfig(),
      sources: remoteImportSources,
    };
  }),

  list: protectedProcedure
    .input(importacaoBllListInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const filters: any[] = [];

      if (input.source) {
        filters.push(eq(importacaoBllProcessos.origem, input.source));
      }

      if (input.conciliationStatus) {
        filters.push(
          eq(
            importacaoBllProcessos.statusConciliacao,
            input.conciliationStatus,
          ),
        );
      }

      if (input.search) {
        const pattern = `%${input.search}%`;
        filters.push(
          or(
            ilike(importacaoBllProcessos.chaveExterna, pattern),
            ilike(importacaoBllProcessos.numeroEdital, pattern),
            ilike(importacaoBllProcessos.numeroAdministrativo, pattern),
            ilike(importacaoBllProcessos.modalidade, pattern),
            ilike(importacaoBllProcessos.objeto, pattern),
            ilike(importacaoBllProcessos.condutorNome, pattern),
            ilike(importacaoBllProcessos.coordenadorNome, pattern),
            ilike(importacaoBllProcessos.autoridadeNome, pattern),
            ilike(importacaoBllProcessos.fornecedorNome, pattern),
          ),
        );
      }

      const whereClause = filters.length ? and(...filters) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: importacaoBllProcessos.id,
            origem: importacaoBllProcessos.origem,
            chaveExterna: importacaoBllProcessos.chaveExterna,
            idOrigem: importacaoBllProcessos.idOrigem,
            numeroEdital: importacaoBllProcessos.numeroEdital,
            numeroAdministrativo: importacaoBllProcessos.numeroAdministrativo,
            anoReferencia: importacaoBllProcessos.anoReferencia,
            modalidade: importacaoBllProcessos.modalidade,
            situacaoExterna: importacaoBllProcessos.situacaoExterna,
            tipoContrato: importacaoBllProcessos.tipoContrato,
            artigo: importacaoBllProcessos.artigo,
            inciso: importacaoBllProcessos.inciso,
            objeto: importacaoBllProcessos.objeto,
            condutorNome: importacaoBllProcessos.condutorNome,
            coordenadorNome: importacaoBllProcessos.coordenadorNome,
            autoridadeNome: importacaoBllProcessos.autoridadeNome,
            fornecedorNome: importacaoBllProcessos.fornecedorNome,
            valorReferencia: importacaoBllProcessos.valorReferencia,
            valorTotal: importacaoBllProcessos.valorTotal,
            publicacaoEm: importacaoBllProcessos.publicacaoEm,
            conclusaoEm: importacaoBllProcessos.conclusaoEm,
            inicioRecepcaoEm: importacaoBllProcessos.inicioRecepcaoEm,
            fimRecepcaoEm: importacaoBllProcessos.fimRecepcaoEm,
            inicioDisputaEm: importacaoBllProcessos.inicioDisputaEm,
            linkExterno: importacaoBllProcessos.linkExterno,
            totalLotes: importacaoBllProcessos.totalLotes,
            totalItens: importacaoBllProcessos.totalItens,
            processoInternoId: importacaoBllProcessos.processoInternoId,
            statusConciliacao: importacaoBllProcessos.statusConciliacao,
            scoreConciliacao: importacaoBllProcessos.scoreConciliacao,
            processoInternoNumeroSirel: processos.numeroSirel,
            processoInternoNumeroAdministrativo: processos.numeroAdministrativo,
            processoInternoModuloAtual: workflowProcesso.moduloAtual,
            ultimaAtualizacaoEm: importacaoBllProcessos.ultimaAtualizacaoEm,
            ultimaExecucaoId: importacaoBllProcessos.ultimaExecucaoId,
          })
          .from(importacaoBllProcessos)
          .leftJoin(
            processos,
            eq(processos.id, importacaoBllProcessos.processoInternoId),
          )
          .leftJoin(
            workflowProcesso,
            eq(workflowProcesso.processoId, processos.id),
          )
          .where(whereClause)
          .orderBy(
            desc(importacaoBllProcessos.publicacaoEm),
            desc(importacaoBllProcessos.ultimaAtualizacaoEm),
            desc(importacaoBllProcessos.id),
          )
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(importacaoBllProcessos)
          .where(whereClause),
      ]);

      const total = Number(totalRow[0]?.total ?? 0);

      return {
        items: rows.map((row) => ({
          ...row,
          valorReferencia: row.valorReferencia
            ? toNumber(row.valorReferencia)
            : null,
          valorTotal: row.valorTotal ? toNumber(row.valorTotal) : null,
        })),
        total,
        page: input.page,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  detail: protectedProcedure
    .input(importacaoBllDetailInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const [record] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.id))
        .limit(1);
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      const items = await db
        .select()
        .from(importacaoBllItens)
        .where(eq(importacaoBllItens.processoImportadoId, input.id))
        .orderBy(
          importacaoBllItens.loteNumero,
          importacaoBllItens.itemNumero,
          importacaoBllItens.id,
        );

      const execution = record.ultimaExecucaoId
        ? ((
            await db
              .select()
              .from(importacaoBllExecucoes)
              .where(eq(importacaoBllExecucoes.id, record.ultimaExecucaoId))
              .limit(1)
          )[0] ?? null)
        : null;
      const linkedProcess = await getLinkedInternalProcess(input.id);
      const suggestions = await getConciliationSuggestions(input.id, {
        limit: 8,
      });

      return {
        record: {
          ...record,
          valorReferencia: record.valorReferencia
            ? toNumber(record.valorReferencia)
            : null,
          valorTotal: record.valorTotal ? toNumber(record.valorTotal) : null,
        },
        items: items.map((item) => ({
          ...item,
          quantidade: item.quantidade ? Number(item.quantidade) : null,
          valorReferencia: item.valorReferencia
            ? toNumber(item.valorReferencia)
            : null,
          valorUnitario: item.valorUnitario
            ? toNumber(item.valorUnitario)
            : null,
          subtotal: item.subtotal ? toNumber(item.subtotal) : null,
        })),
        execution,
        linkedProcess,
        suggestions,
      };
    }),

  executions: protectedProcedure
    .input(importacaoBllExecutionListInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const filters = input.source
        ? [eq(importacaoBllExecucoes.origem, input.source)]
        : [];
      const whereClause = filters.length ? and(...filters) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(importacaoBllExecucoes)
          .where(whereClause)
          .orderBy(
            desc(importacaoBllExecucoes.iniciadoEm),
            desc(importacaoBllExecucoes.id),
          )
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(importacaoBllExecucoes)
          .where(whereClause),
      ]);

      const total = Number(totalRow[0]?.total ?? 0);
      return {
        items: rows,
        total,
        page: input.page,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  searchProcessos: protectedProcedure
    .input(importacaoBllSearchProcessosInputSchema)
    .query(async ({ input }) => {
      const suggestions = await getConciliationSuggestions(input.importedId, {
        search: input.search,
        limit: input.pageSize,
      });

      return {
        items: suggestions,
      };
    }),

  linkProcesso: operadorProcedure
    .input(importacaoBllLinkProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      try {
        await linkImportedProcessToInternal(
          input.importedId,
          input.processoId,
          ctx.user!.id,
          "MANUAL",
        );
      } catch (error) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível vincular o processo interno.",
        });
      }

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: `Registro importado vinculado ao processo interno ${input.processoId}`,
      });

      return {
        message: "Vínculo realizado com sucesso.",
      };
    }),

  unlinkProcesso: operadorProcedure
    .input(importacaoBllUnlinkProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      await unlinkImportedProcess(input.importedId);

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: "Vínculo com processo interno removido.",
      });

      return {
        message: "Vínculo removido.",
      };
    }),

  setIgnored: operadorProcedure
    .input(importacaoBllSetIgnoredInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      await setImportedProcessIgnored(
        input.importedId,
        input.ignored,
        ctx.user!.id,
      );

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: input.ignored
          ? "Registro importado marcado como ignorado."
          : "Registro importado reaberto para conciliação.",
      });

      return {
        message: input.ignored
          ? "Registro marcado como ignorado."
          : "Registro reaberto para conciliação.",
      };
    }),

  deleteProcesso: operadorProcedure
    .input(importacaoBllDeleteProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      await deleteImportedProcess(input.importedId);

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "DELETE",
        dadosAnteriores: before,
        dadosNovos: null,
        descricao: "Registro importado excluído manualmente.",
      });

      return {
        message: "Registro importado excluído com sucesso.",
      };
    }),

  deleteProcessos: operadorProcedure
    .input(importacaoBllDeleteProcessosInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const rows = await db
        .select()
        .from(importacaoBllProcessos)
        .where(inArray(importacaoBllProcessos.id, input.importedIds));

      if (!rows.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum registro importado encontrado para exclusão.",
        });
      }

      await deleteImportedProcesses(input.importedIds);

      for (const row of rows) {
        await logAuditoria(ctx, {
          tabela: "importacao_bll_processos",
          registroId: row.id,
          acao: "DELETE",
          dadosAnteriores: row,
          dadosNovos: null,
          descricao: "Registro importado excluído manualmente em lote.",
        });
      }

      return {
        message: `${rows.length} registro(s) importado(s) excluído(s) com sucesso.`,
      };
    }),

  autoReconcile: operadorProcedure
    .input(importacaoBllAutoReconcileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await autoReconcileImportedProcesses({
        source: input.source,
        onlyPending: input.onlyPending,
        userId: ctx.user!.id,
      });

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: 0,
        acao: "UPDATE",
        dadosNovos: result,
        descricao: `Conciliação automática executada${input.source ? ` para ${input.source}` : ""}.`,
      });

      return {
        message: `Conciliação concluída: ${result.vinculados} vínculo(s), ${result.sugeridos} sugestão(ões) e ${result.pendentes} pendência(s).`,
        result,
      };
    }),

  syncRemote: operadorProcedure
    .input(importacaoBllRemoteSyncInputSchema)
    .mutation(async ({ ctx, input }) => {
      const results = input.source
        ? [await syncRemoteImport(input.source, { criadoPor: ctx.user!.id })]
        : await syncAllRemoteImports({ criadoPor: ctx.user!.id });

      for (const result of results) {
        await logAuditoria(ctx, {
          tabela: "importacao_bll_execucoes",
          registroId: result.executionId,
          acao: "CREATE",
          dadosNovos: result,
          descricao: `Sincronização remota executada para ${result.origem}`,
        });
      }

      return {
        message: `Sincronização concluída para ${results.length} origem(ns).`,
        results,
      };
    }),

  importCsv: operadorProcedure
    .input(importacaoBllCsvInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await importCsvBundle({
        source: input.source,
        registrosFilename: input.registrosFilename,
        registrosContent: input.registrosContent,
        itensFilename: input.itensFilename,
        itensContent: input.itensContent,
        criadoPor: ctx.user!.id,
      });

      await logAuditoria(ctx, {
        tabela: "importacao_bll_execucoes",
        registroId: result.executionId,
        acao: "CREATE",
        dadosNovos: result,
        descricao: `Importação manual por CSV executada para ${result.origem}`,
      });

      return {
        message: `Importação manual concluída com ${result.totalRegistros} registro(s).`,
        result,
      };
    }),

  // PNCP Conciliation endpoints
  searchPncpProcesses: protectedProcedure
    .input(importacaoBllSearchProcessosInputSchema) // Reutilizando schema similar
    .query(async ({ input }) => {
      // Por enquanto, busca processos PNCP recentes para demonstração
      const pncpResults = await searchPncpProcesses({
        pagina: 1,
        tamanhoPagina: input.pageSize,
      });

      return {
        items: pncpResults.data.map(process => ({
          processoId: parseInt(process.numeroControlePNCP.replace(/\D/g, '')) || 0,
          numeroSirel: process.numeroControlePNCP,
          numeroAdministrativo: null,
          numeroEdital: null,
          objeto: process.objetoCompra,
          modalidade: process.modalidadeNome,
          secretaria: process.orgaoEntidadeNome,
          moduloAtual: null,
          valorEstimado: process.valorTotalEstimado,
          score: 0,
          nivel: "BAIXO" as const,
          motivos: [`Processo PNCP: ${process.numeroControlePNCP}`],
        })),
      };
    }),

  getPncpSuggestions: protectedProcedure
    .input(importacaoBllDetailInputSchema)
    .query(async ({ input }) => {
      const suggestions = await generatePncpConciliationSuggestions(input.id, 10);

      return {
        suggestions: suggestions.map(s => ({
          processoId: parseInt(s.pncpProcess.numeroControlePNCP.replace(/\D/g, '')) || 0,
          numeroSirel: s.pncpProcess.numeroControlePNCP,
          numeroAdministrativo: null,
          numeroEdital: null,
          objeto: s.pncpProcess.objetoCompra,
          modalidade: s.pncpProcess.modalidadeNome,
          secretaria: s.pncpProcess.orgaoEntidadeNome,
          moduloAtual: null,
          valorEstimado: s.pncpProcess.valorTotalEstimado,
          score: s.score,
          nivel: s.nivel,
          motivos: s.motivos,
        })),
      };
    }),

  linkPncpProcess: operadorProcedure
    .input(importacaoBllLinkProcessoInputSchema) // Reutilizando schema
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();

      // Busca dados do processo PNCP
      const pncpDetails = await getPncpProcessDetails(
        new Date().getFullYear(), // Ano atual como fallback
        input.processoId
      );

      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);

      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      // Atualiza com dados PNCP
      await db
        .update(importacaoBllProcessos)
        .set({
          codigoPncp: pncpDetails.numeroControlePNCP,
          urlPncp: pncpDetails.urlProcesso,
          dataSincronizacaoPncp: new Date(),
          statusConciliacao: "VINCULADO" as const,
          detalhesConciliacao: {
            tipo: "PNCP_MANUAL",
            pncpProcess: pncpDetails,
            conciliadoPor: ctx.user!.id,
            conciliadoEm: new Date(),
          },
        })
        .where(eq(importacaoBllProcessos.id, input.importedId));

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: `Registro importado vinculado ao processo PNCP ${pncpDetails.numeroControlePNCP}`,
      });

      return {
        message: "Vínculo com PNCP realizado com sucesso.",
      };
    }),

  autoConciliatePncp: operadorProcedure
    .input(importacaoBllAutoReconcileInputSchema) // Reutilizando schema
    .mutation(async ({ ctx, input }) => {
      const result = await executeAutomaticPncpConciliation(
        input.source,
        75 // Score mínimo para conciliação automática
      );

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: 0,
        acao: "UPDATE",
        dadosNovos: result,
        descricao: `Conciliação automática PNCP executada${input.source ? ` para ${input.source}` : ""}.`,
      });

      return {
        message: `Conciliação PNCP concluída: ${result.conciliations} conciliação(ões), ${result.processed} processado(s) e ${result.errors} erro(s).`,
        result,
      };
    }),
});
