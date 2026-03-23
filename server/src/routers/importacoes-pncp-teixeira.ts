import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { requireDb } from "../db/client.js";
import { logAuditoria } from "../db/auditoria.js";
import { importacaoBllProcessos } from "../db/schema.js";
import { PNCPClientTeixeira } from "../lib/pncp/pncp-client-teixeira.js";
import { PNCP_CONFIG } from "../lib/pncp/config.js";

export const pncpTeixeiraRouter = router({
  importAllData: protectedProcedure
    .input(
      z.object({
        dataInicio: z.string().date(),
        dataFim: z.string().date(),
        incluirItens: z.boolean().default(true),
        incluirAtas: z.boolean().default(true),
        incluirContratos: z.boolean().default(true),
        dryRun: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const client = new PNCPClientTeixeira();

      const pncpData = await client.fetchAllDataTeixeiraFreitas({
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        incluirItens: input.incluirItens,
        incluirAtas: input.incluirAtas,
        incluirContratos: input.incluirContratos,
      });

      if (input.dryRun) {
        return {
          success: true,
          dryRun: true,
          summary: {
            contratacoes: pncpData.contratacoes.length,
            atas: pncpData.atas.length,
            contratos: pncpData.contratos.length,
            errors: pncpData.errors.length,
          },
          errors: pncpData.errors.slice(0, 10),
        };
      }

      const results = {
        contratacoesImportadas: 0,
        atasImportadas: 0,
        contratosImportados: 0,
        termosAditivosImportados: 0,
        errors: [] as string[],
      };

      for (const contratacao of pncpData.contratacoes) {
        try {
          await db.insert(importacaoBllProcessos).values({
            origem: "LICITACAO",
            chaveExterna: contratacao.numeroControlePNCP,
            idOrigem: contratacao.id,
            numeroEdital: contratacao.numeroControlePNCP,
            anoReferencia: contratacao.anoCompra,
            modalidade: contratacao.modalidadeNome,
            objeto: contratacao.objetoCompra,
            valorTotal: contratacao.valorTotalEstimado,
            publicacaoEm: new Date(contratacao.dataPublicacaoPncp),
            dataSincronizacaoPncp: new Date(),
            codigoPncp: contratacao.numeroControlePNCP,
            urlPncp: contratacao.urlProcesso,
            statusConciliacao: "PENDENTE",
            dadosOriginais: contratacao,
          }).onConflictDoUpdate({
            target: [importacaoBllProcessos.chaveExterna],
            set: {
              ultimaAtualizacaoEm: new Date(),
              valorTotal: contratacao.valorTotalEstimado,
              statusConciliacao: "PENDENTE",
            },
          });
          results.contratacoesImportadas++;
        } catch (error: any) {
          results.errors.push(`Erro contratação ${contratacao.numeroControlePNCP}: ${error?.message ?? String(error)}`);
        }
      }

      await logAuditoria(ctx, {
        tabela: "importacoes_pncp",
        registroId: 0,
        acao: "UPDATE",
        descricao: `Importação PNCP ${PNCP_CONFIG.TEIXEIRA_FREITAS.nome} (${PNCP_CONFIG.TEIXEIRA_FREITAS.cnpjFormatado})`,
      });

      return {
        success: true,
        summary: results,
        message: `Importação concluída: ${results.contratacoesImportadas} contratações, ${results.atasImportadas} atas, ${results.contratosImportados} contratos. ${results.errors.length} erros.`,
      };
    }),

  previewData: protectedProcedure
    .input(
      z.object({
        dataInicio: z.string().date(),
        dataFim: z.string().date(),
      }),
    )
    .query(async ({ input }) => {
      const client = new PNCPClientTeixeira();
      const [contratacoes, atas, contratos] = await Promise.all([
        client.fetchContratacoes({
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          pagina: 1,
          tamanhoPagina: 10,
        }),
        client.fetchAtasRegistroPreco({
          dataInicioVigencia: input.dataInicio,
          dataFimVigencia: input.dataFim,
          pagina: 1,
          tamanhoPagina: 10,
        }),
        client.fetchContratos({
          dataAssinaturaInicio: input.dataInicio,
          dataAssinaturaFim: input.dataFim,
          pagina: 1,
          tamanhoPagina: 10,
        }),
      ]);

      return {
        contratacoes: {
          total: contratacoes.total ?? 0,
          amostra: (contratacoes.data ?? []).slice(0, 5).map((c: any) => ({
            numeroControlePNCP: c.numeroControlePNCP,
            objetoCompra: c.objetoCompra,
            valorTotalEstimado: c.valorTotalEstimado,
            dataPublicacaoPncp: c.dataPublicacaoPncp,
            urlProcesso: c.urlProcesso,
          })),
        },
        atas: {
          total: atas.total ?? 0,
          amostra: (atas.data ?? []).slice(0, 5).map((a: any) => ({
            idAtaPNCP: a.idAtaPNCP,
            numeroAta: a.numeroAta,
            objeto: a.objeto,
            dataInicioVigencia: a.dataInicioVigencia,
            dataFimVigencia: a.dataFimVigencia,
          })),
        },
        contratos: {
          total: contratos.total ?? 0,
          amostra: (contratos.data ?? []).slice(0, 5).map((c: any) => ({
            idContratoPNCP: c.idContratoPNCP,
            numeroContrato: c.numeroContrato,
            objeto: c.objeto,
            valorTotal: c.valorTotal,
            dataAssinatura: c.dataAssinatura,
            fornecedorNome: c.fornecedor?.razaoSocial,
          })),
        },
      };
    }),
});
