import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  pncpStoredDeleteInputSchema,
  pncpStoredDetailInputSchema,
  pncpStoredLinkProcessoInputSchema,
  pncpStoredListInputSchema,
  pncpStoredSearchProcessosInputSchema,
  pncpStoredUnlinkProcessoInputSchema,
  type PncpStoredEntity,
} from "@sirel/shared/schemas/importacoes";
import { protectedProcedure, router } from "../trpc.js";
import { requireDb } from "../db/client.js";
import { logAuditoria } from "../db/auditoria.js";
import {
  importacaoPncpAditivos,
  importacaoPncpAtas,
  importacaoPncpContratacoes,
  importacaoPncpContratos,
  importacaoPncpExecucoes,
  importacaoPncpFornecedores,
  importacaoPncpItensAta,
  importacaoPncpItensContratacao,
  modalidades,
  processos,
  secretarias,
  workflowProcesso,
} from "../db/schema.js";
import { PNCPClientTeixeira } from "../lib/pncp/pncp-client-teixeira.js";
import { PNCP_CONFIG } from "../lib/pncp/config.js";

function normalizeCompareText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCompare(value: unknown) {
  return normalizeCompareText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function textSimilarity(left: unknown, right: unknown) {
  const a = new Set(tokenizeCompare(left));
  const b = new Set(tokenizeCompare(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function valueSimilarity(left: unknown, right: unknown) {
  const n1 = Number(left ?? 0);
  const n2 = Number(right ?? 0);
  if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 <= 0 || n2 <= 0) {
    return 0;
  }
  const delta = Math.abs(n1 - n2) / Math.max(n1, n2);
  return delta <= 0.25 ? 1 - delta / 0.25 : 0;
}

type StoredComparable = {
  id: number;
  tipo: PncpStoredEntity;
  objeto: string | null;
  modalidade: string | null;
  valor: string | number | null;
  processoInternoId: number | null;
};

async function loadLinkedProcess(
  db: ReturnType<typeof requireDb>,
  processoId: number | null | undefined,
) {
  if (!processoId) return null;
  const [row] = await db
    .select({
      id: processos.id,
      numeroSirel: processos.numeroSirel,
      numeroAdministrativo: processos.numeroAdministrativo,
      numeroEdital: processos.numeroEdital,
      objeto: processos.objeto,
      valorEstimado: processos.valorEstimado,
      secretariaNome: secretarias.nome,
      modalidadeNome: modalidades.nome,
      moduloAtual: workflowProcesso.moduloAtual,
    })
    .from(processos)
    .leftJoin(secretarias, eq(secretarias.id, processos.secretariaId))
    .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
    .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
    .where(eq(processos.id, processoId))
    .limit(1);

  return row ?? null;
}

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

      const [execRow] = await db
        .insert(importacaoPncpExecucoes)
        .values({
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          status: "PROCESSANDO",
          agendada: false,
          criadoPor: ctx.user?.id ?? null,
        })
        .returning({ id: importacaoPncpExecucoes.id });

      const results = {
        contratacoesImportadas: 0,
        itensContratacaoImportados: 0,
        atasImportadas: 0,
        itensAtaImportados: 0,
        contratosImportados: 0,
        aditivosImportados: 0,
        fornecedoresImportados: 0,
        errors: [] as string[],
      };

      const fornecedorCache = new Map<string, number>();
      const normalizeDoc = (value: unknown) =>
        String(value ?? "").replace(/[^\d]+/g, "").trim() || null;
      const normalizeText = (value: unknown) =>
        String(value ?? "").replace(/\s+/g, " ").trim() || null;
      const parseDate = (value: unknown) => {
        if (!value) return null;
        const parsed = new Date(String(value));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };
      const parseNumeric = (value: unknown) => {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value === "number") {
          return Number.isFinite(value) ? String(value) : null;
        }
        const normalized = String(value)
          .trim()
          .replace(/\./g, "")
          .replace(",", ".");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? String(parsed) : null;
      };

      async function ensureFornecedor(raw: any) {
        const documento =
          normalizeDoc(raw?.cnpj) ||
          normalizeDoc(raw?.cpf) ||
          normalizeDoc(raw?.cpfCnpj) ||
          normalizeDoc(raw?.documento);
        const nome =
          normalizeText(raw?.razaoSocial) ||
          normalizeText(raw?.nome) ||
          normalizeText(raw?.nomeFantasia);
        if (!documento || !nome) return null;

        if (fornecedorCache.has(documento)) {
          return fornecedorCache.get(documento) ?? null;
        }

        const [saved] = await db
          .insert(importacaoPncpFornecedores)
          .values({
            documento,
            nome,
            tipo: documento.length === 11 ? "PF" : "PJ",
            municipio: normalizeText(raw?.municipio),
            uf: normalizeText(raw?.uf),
            dadosOriginais: raw ?? null,
            atualizadoEm: new Date(),
          })
          .onConflictDoUpdate({
            target: [importacaoPncpFornecedores.documento],
            set: {
              nome,
              municipio: normalizeText(raw?.municipio),
              uf: normalizeText(raw?.uf),
              dadosOriginais: raw ?? null,
              atualizadoEm: new Date(),
            },
          })
          .returning({ id: importacaoPncpFornecedores.id });

        if (saved?.id) {
          fornecedorCache.set(documento, saved.id);
          results.fornecedoresImportados += 1;
          return saved.id;
        }
        return null;
      }

      for (const contratacao of pncpData.contratacoes) {
        try {
          const numeroControlePncp =
            contratacao.numeroControlePNCP ??
            contratacao.numeroControlePncp ??
            contratacao.numeroControlePNCPCompra ??
            null;
          if (!numeroControlePncp) {
            results.errors.push("Contratação PNCP sem número de controle.");
            continue;
          }
          const orgaoEntidadeNome =
            contratacao.orgaoEntidadeNome ??
            contratacao.orgaoEntidade?.razaoSocial ??
            null;
          const orgaoEntidadeCnpj =
            contratacao.orgaoEntidadeCnpj ??
            contratacao.orgaoEntidade?.cnpj ??
            null;
          const unidadeNome =
            contratacao.unidadeNome ??
            contratacao.unidadeOrgao?.nomeUnidade ??
            null;
          const situacao =
            contratacao.situacao ??
            contratacao.situacaoCompraNome ??
            null;
          const urlProcesso =
            contratacao.urlProcesso ??
            contratacao.linkProcessoEletronico ??
            contratacao.linkSistemaOrigem ??
            null;
          const criterioJulgamento =
            contratacao.criterioJulgamentoNome ??
            contratacao.criterioJulgamento ??
            null;

          const [savedContratacao] = await db
            .insert(importacaoPncpContratacoes)
            .values({
              numeroControlePncp: String(numeroControlePncp),
              anoCompra: contratacao.anoCompra ? Number(contratacao.anoCompra) : null,
              sequencialCompra: contratacao.sequencialCompra ? Number(contratacao.sequencialCompra) : null,
              modalidade: normalizeText(contratacao.modalidadeNome ?? contratacao.modalidade),
              modoDisputa: normalizeText(contratacao.modoDisputaNome ?? contratacao.modoDisputa),
              criterioJulgamento: normalizeText(criterioJulgamento),
              objeto: normalizeText(contratacao.objetoCompra ?? contratacao.objeto),
              valorTotalEstimado: parseNumeric(
                contratacao.valorTotalEstimado ??
                  contratacao.valorTotalHomologado ??
                  contratacao.valorTotal,
              ),
              dataPublicacao: parseDate(contratacao.dataPublicacaoPncp),
              dataAberturaProposta: parseDate(contratacao.dataAberturaProposta),
              dataEncerramentoProposta: parseDate(contratacao.dataEncerramentoProposta),
              orgaoEntidadeNome: normalizeText(orgaoEntidadeNome),
              orgaoEntidadeCnpj: normalizeDoc(orgaoEntidadeCnpj),
              unidadeNome: normalizeText(unidadeNome),
              situacao: normalizeText(situacao),
              urlProcesso: normalizeText(urlProcesso),
              dadosOriginais: contratacao,
              ultimaExecucaoId: execRow.id,
              atualizadoEm: new Date(),
            })
            .onConflictDoUpdate({
              target: [importacaoPncpContratacoes.numeroControlePncp],
              set: {
                modalidade: normalizeText(contratacao.modalidadeNome ?? contratacao.modalidade),
                modoDisputa: normalizeText(contratacao.modoDisputaNome ?? contratacao.modoDisputa),
                criterioJulgamento: normalizeText(criterioJulgamento),
                objeto: normalizeText(contratacao.objetoCompra ?? contratacao.objeto),
                valorTotalEstimado: parseNumeric(
                  contratacao.valorTotalEstimado ??
                    contratacao.valorTotalHomologado ??
                    contratacao.valorTotal,
                ),
                dataPublicacao: parseDate(contratacao.dataPublicacaoPncp),
                dataAberturaProposta: parseDate(contratacao.dataAberturaProposta),
                dataEncerramentoProposta: parseDate(contratacao.dataEncerramentoProposta),
                situacao: normalizeText(situacao),
                urlProcesso: normalizeText(urlProcesso),
                dadosOriginais: contratacao,
                ultimaExecucaoId: execRow.id,
                atualizadoEm: new Date(),
              },
            })
            .returning({ id: importacaoPncpContratacoes.id });

          results.contratacoesImportadas += 1;

          await db
            .delete(importacaoPncpItensContratacao)
            .where(eq(importacaoPncpItensContratacao.contratacaoId, savedContratacao.id));

          const itens = Array.isArray(contratacao.itens) ? contratacao.itens : [];
          if (itens.length) {
            const rows = [];
            for (const item of itens) {
              const fornecedorId = await ensureFornecedor(item?.fornecedor ?? item?.fornecedorVencedor ?? item?.fornecedorHomologado);
              rows.push({
                contratacaoId: savedContratacao.id,
                numeroItem: normalizeText(item?.numeroItem ?? item?.numero),
                descricao: normalizeText(item?.descricaoItem ?? item?.descricao),
                unidade: normalizeText(item?.unidadeMedida ?? item?.unidade),
                quantidade: parseNumeric(item?.quantidade),
                valorUnitario: parseNumeric(
                  item?.valorUnitario ??
                    item?.valorUnitarioEstimado ??
                    item?.valorEstimado,
                ),
                valorTotal: parseNumeric(
                  item?.valorTotal ??
                    item?.valorTotalEstimado ??
                    item?.valorHomologado,
                ),
                situacao: normalizeText(
                  item?.situacao ??
                    item?.situacaoCompraItemNome ??
                    item?.situacaoCompraItem,
                ),
                fornecedorNome: normalizeText(item?.fornecedor?.razaoSocial ?? item?.fornecedorNome ?? item?.fornecedor),
                fornecedorDocumento: normalizeDoc(item?.fornecedor?.cnpj ?? item?.fornecedor?.cpf ?? item?.fornecedorDocumento),
                fornecedorImportadoId: fornecedorId,
                dadosOriginais: item,
              });
            }
            if (rows.length) {
              await db.insert(importacaoPncpItensContratacao).values(rows);
              results.itensContratacaoImportados += rows.length;
            }
          }
        } catch (error: any) {
          results.errors.push(
            `Erro contratação ${contratacao.numeroControlePNCP ?? contratacao.numeroControlePncp ?? "sem número"}: ${error?.message ?? String(error)}`,
          );
        }
      }

      for (const ata of pncpData.atas) {
        try {
          const idAtaPncp =
            ata.numeroControlePNCPAta ??
            ata.numeroControlePNCP ??
            ata.numeroControlePncp ??
            ata.idAtaPNCP ??
            ata.idAtaPncp ??
            ata.idAta ??
            ata.id ??
            null;
          if (!idAtaPncp) {
            results.errors.push("Ata PNCP sem identificador.");
            continue;
          }
          const numeroAta =
            ata.numeroAta ??
            ata.numeroAtaRegistroPreco ??
            null;
          const objeto = ata.objeto ?? ata.objetoContratacao ?? null;
          const dataInicioVigencia =
            ata.dataInicioVigencia ?? ata.vigenciaInicio ?? null;
          const dataFimVigencia =
            ata.dataFimVigencia ?? ata.vigenciaFim ?? null;
          const situacao =
            ata.situacao ?? (ata.cancelado ? "Cancelada" : "Ativa");
          const orgaoGerenciadorNome =
            ata.orgaoGerenciador?.nome ??
            ata.orgaoGerenciadorNome ??
            ata.nomeOrgao ??
            null;
          const orgaoGerenciadorCnpj =
            ata.orgaoGerenciador?.cnpj ??
            ata.orgaoGerenciadorCnpj ??
            ata.cnpjOrgao ??
            null;

          const fornecedorId = await ensureFornecedor(ata?.fornecedor ?? ata?.fornecedorDetentor);
          const [savedAta] = await db
            .insert(importacaoPncpAtas)
            .values({
              idAtaPncp: String(idAtaPncp),
              numeroAta: normalizeText(numeroAta),
              objeto: normalizeText(objeto),
              valorGlobal: parseNumeric(ata.valorGlobal ?? ata.valorTotal),
              dataAssinatura: parseDate(ata.dataAssinatura),
              dataInicioVigencia: parseDate(dataInicioVigencia),
              dataFimVigencia: parseDate(dataFimVigencia),
              situacao: normalizeText(situacao),
              orgaoGerenciadorNome: normalizeText(orgaoGerenciadorNome),
              orgaoGerenciadorCnpj: normalizeDoc(orgaoGerenciadorCnpj),
              fornecedorNome: normalizeText(ata.fornecedor?.razaoSocial ?? ata.fornecedorNome),
              fornecedorDocumento: normalizeDoc(ata.fornecedor?.cnpj ?? ata.fornecedor?.cpf ?? ata.fornecedorDocumento),
              fornecedorImportadoId: fornecedorId,
              urlAta: normalizeText(ata.urlAta ?? ata.urlProcesso),
              dadosOriginais: ata,
              ultimaExecucaoId: execRow.id,
              atualizadoEm: new Date(),
            })
            .onConflictDoUpdate({
              target: [importacaoPncpAtas.idAtaPncp],
              set: {
                objeto: normalizeText(objeto),
                valorGlobal: parseNumeric(ata.valorGlobal ?? ata.valorTotal),
                dataAssinatura: parseDate(ata.dataAssinatura),
                dataInicioVigencia: parseDate(dataInicioVigencia),
                dataFimVigencia: parseDate(dataFimVigencia),
                situacao: normalizeText(situacao),
                fornecedorNome: normalizeText(ata.fornecedor?.razaoSocial ?? ata.fornecedorNome),
                fornecedorDocumento: normalizeDoc(ata.fornecedor?.cnpj ?? ata.fornecedor?.cpf ?? ata.fornecedorDocumento),
                fornecedorImportadoId: fornecedorId,
                urlAta: normalizeText(ata.urlAta ?? ata.urlProcesso),
                dadosOriginais: ata,
                ultimaExecucaoId: execRow.id,
                atualizadoEm: new Date(),
              },
            })
            .returning({ id: importacaoPncpAtas.id });

          results.atasImportadas += 1;

          await db
            .delete(importacaoPncpItensAta)
            .where(eq(importacaoPncpItensAta.ataId, savedAta.id));

          const itensAta = Array.isArray(ata.itens) ? ata.itens : [];
          if (itensAta.length) {
            const rows = [];
            for (const item of itensAta) {
              const fornecedorIdItem = await ensureFornecedor(item?.fornecedor ?? item?.fornecedorDetentor);
              rows.push({
                ataId: savedAta.id,
                numeroItem: normalizeText(item?.numeroItem ?? item?.numero),
                descricao: normalizeText(item?.descricaoItem ?? item?.descricao),
                unidade: normalizeText(item?.unidadeMedida ?? item?.unidade),
                quantidade: parseNumeric(item?.quantidade),
                valorUnitario: parseNumeric(
                  item?.valorUnitario ??
                    item?.valorUnitarioEstimado ??
                    item?.valorEstimado,
                ),
                valorTotal: parseNumeric(
                  item?.valorTotal ??
                    item?.valorTotalEstimado ??
                    item?.valorHomologado,
                ),
                fornecedorNome: normalizeText(item?.fornecedor?.razaoSocial ?? item?.fornecedorNome ?? item?.fornecedor),
                fornecedorDocumento: normalizeDoc(item?.fornecedor?.cnpj ?? item?.fornecedor?.cpf ?? item?.fornecedorDocumento),
                fornecedorImportadoId: fornecedorIdItem,
                dadosOriginais: item,
              });
            }
            if (rows.length) {
              await db.insert(importacaoPncpItensAta).values(rows);
              results.itensAtaImportados += rows.length;
            }
          }
        } catch (error: any) {
          results.errors.push(
            `Erro ata ${ata.idAtaPNCP ?? ata.idAtaPncp ?? ata.numeroControlePNCPAta ?? ata.idAta ?? ata.id}: ${error?.message ?? String(error)}`,
          );
        }
      }

      for (const contrato of pncpData.contratos) {
        try {
          const fornecedorRaw =
            contrato?.fornecedor ??
            {
              cnpj: contrato?.niFornecedor,
              razaoSocial: contrato?.nomeRazaoSocialFornecedor,
            };
          const fornecedorId = await ensureFornecedor(fornecedorRaw);
          const idContratoPncp =
            contrato.idContratoPNCP ??
            contrato.idContratoPncp ??
            contrato.idContrato ??
            contrato.numeroControlePNCP ??
            contrato.numeroControlePncp ??
            null;
          if (!idContratoPncp) {
            results.errors.push("Contrato PNCP sem identificador.");
            continue;
          }
          const numeroContrato =
            contrato.numeroContrato ??
            contrato.numeroContratoEmpenho ??
            null;
          const objeto =
            contrato.objeto ??
            contrato.objetoContrato ??
            null;
          const modalidade =
            contrato.modalidadeNome ??
            contrato.modalidade ??
            contrato.categoriaProcesso?.nome ??
            null;
          const valorTotal =
            contrato.valorTotal ??
            contrato.valorGlobal ??
            contrato.valorParcela ??
            contrato.valorInicial ??
            null;
          const dataInicioVigencia =
            contrato.dataInicioVigencia ??
            contrato.dataVigenciaInicio ??
            null;
          const dataFimVigencia =
            contrato.dataFimVigencia ??
            contrato.dataVigenciaFim ??
            null;
          const situacao =
            contrato.situacao ??
            contrato.status ??
            null;
          const fornecedorNome =
            contrato.fornecedor?.razaoSocial ??
            contrato.fornecedorNome ??
            contrato.nomeRazaoSocialFornecedor ??
            null;
          const fornecedorDocumento =
            contrato.fornecedor?.cnpj ??
            contrato.fornecedor?.cpf ??
            contrato.fornecedorDocumento ??
            contrato.niFornecedor ??
            null;
          const urlContrato =
            contrato.urlContrato ??
            contrato.urlProcesso ??
            contrato.urlCipi ??
            contrato.linkSistemaOrigem ??
            null;

          const [savedContrato] = await db
            .insert(importacaoPncpContratos)
            .values({
              idContratoPncp: String(idContratoPncp),
              numeroContrato: normalizeText(numeroContrato),
              objeto: normalizeText(objeto),
              modalidade: normalizeText(modalidade),
              valorTotal: parseNumeric(valorTotal),
              dataAssinatura: parseDate(contrato.dataAssinatura),
              dataInicioVigencia: parseDate(dataInicioVigencia),
              dataFimVigencia: parseDate(dataFimVigencia),
              dataEncerramento: parseDate(contrato.dataEncerramento),
              situacao: normalizeText(situacao),
              fornecedorNome: normalizeText(fornecedorNome),
              fornecedorDocumento: normalizeDoc(fornecedorDocumento),
              fornecedorImportadoId: fornecedorId,
              urlContrato: normalizeText(urlContrato),
              dadosOriginais: contrato,
              ultimaExecucaoId: execRow.id,
              atualizadoEm: new Date(),
            })
            .onConflictDoUpdate({
              target: [importacaoPncpContratos.idContratoPncp],
              set: {
                objeto: normalizeText(objeto),
                modalidade: normalizeText(modalidade),
                valorTotal: parseNumeric(valorTotal),
                dataAssinatura: parseDate(contrato.dataAssinatura),
                dataInicioVigencia: parseDate(dataInicioVigencia),
                dataFimVigencia: parseDate(dataFimVigencia),
                dataEncerramento: parseDate(contrato.dataEncerramento),
                situacao: normalizeText(situacao),
                fornecedorNome: normalizeText(fornecedorNome),
                fornecedorDocumento: normalizeDoc(fornecedorDocumento),
                fornecedorImportadoId: fornecedorId,
                urlContrato: normalizeText(urlContrato),
                dadosOriginais: contrato,
                ultimaExecucaoId: execRow.id,
                atualizadoEm: new Date(),
              },
            })
            .returning({ id: importacaoPncpContratos.id });

          results.contratosImportados += 1;

          await db
            .delete(importacaoPncpAditivos)
            .where(eq(importacaoPncpAditivos.contratoId, savedContrato.id));

          const aditivos = Array.isArray(contrato.aditivos) ? contrato.aditivos : [];
          if (aditivos.length) {
            const rows = aditivos.map((aditivo: any) => ({
              contratoId: savedContrato.id,
              idAditivoPncp: normalizeText(
                aditivo.idTermoAditivo ??
                  aditivo.idAditivo ??
                  aditivo.id ??
                  aditivo.sequencialTermoContrato,
              ),
              numeroAditivo: normalizeText(
                aditivo.numeroTermoAditivo ??
                  aditivo.numeroAditivo ??
                  aditivo.numeroTermoContrato,
              ),
              tipoAditivo: normalizeText(
                aditivo.tipoTermoAditivo ??
                  aditivo.tipoAditivo ??
                  aditivo.tipoTermoContratoNome,
              ),
              objeto: normalizeText(
                aditivo.objeto ??
                  aditivo.objetoTermoContrato,
              ),
              valorAditivo: parseNumeric(
                aditivo.valorAditivo ??
                  aditivo.valorAcrescido ??
                  aditivo.valorGlobal ??
                  aditivo.valorParcela,
              ),
              dataAssinatura: parseDate(aditivo.dataAssinatura),
              dataInicioVigencia: parseDate(aditivo.dataInicioVigencia),
              dataFimVigencia: parseDate(aditivo.dataFimVigencia),
              dadosOriginais: aditivo,
            }));
            if (rows.length) {
              await db.insert(importacaoPncpAditivos).values(rows);
              results.aditivosImportados += rows.length;
            }
          }
        } catch (error: any) {
          results.errors.push(
            `Erro contrato ${contrato.idContratoPNCP ?? contrato.idContratoPncp ?? contrato.numeroControlePNCP ?? contrato.idContrato ?? contrato.id}: ${error?.message ?? String(error)}`,
          );
        }
      }

      await db
        .update(importacaoPncpExecucoes)
        .set({
          status: results.errors.length ? "ERRO" : "CONCLUIDA",
          totalContratacoes: results.contratacoesImportadas,
          totalItensContratacao: results.itensContratacaoImportados,
          totalAtas: results.atasImportadas,
          totalItensAta: results.itensAtaImportados,
          totalContratos: results.contratosImportados,
          totalAditivos: results.aditivosImportados,
          totalFornecedores: results.fornecedoresImportados,
          mensagem: `Importação concluída: ${results.contratacoesImportadas} contratações, ${results.itensContratacaoImportados} itens, ${results.atasImportadas} atas, ${results.contratosImportados} contratos e ${results.aditivosImportados} aditivos.`,
          erros: results.errors,
          finalizadoEm: new Date(),
        })
        .where(eq(importacaoPncpExecucoes.id, execRow.id));

      await logAuditoria(ctx, {
        tabela: "importacoes_pncp",
        registroId: execRow.id,
        acao: "UPDATE",
        descricao: `Importação PNCP ${PNCP_CONFIG.TEIXEIRA_FREITAS.nome} (${PNCP_CONFIG.TEIXEIRA_FREITAS.cnpjFormatado})`,
      });

      return {
        success: true,
        summary: results,
        message: `Importação concluída: ${results.contratacoesImportadas} contratações, ${results.itensContratacaoImportados} itens, ${results.atasImportadas} atas, ${results.contratosImportados} contratos e ${results.aditivosImportados} aditivos. ${results.errors.length} erro(s).`,
      };
    }),

  deleteStored: protectedProcedure
    .input(pncpStoredDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();

      if (input.tipo === "CONTRATACOES") {
        const [before] = await db
          .select()
          .from(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id))
          .limit(1);
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Registro PNCP não encontrado para exclusão.",
          });
        }

        await db
          .delete(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id));

        await logAuditoria(ctx, {
          tabela: "importacao_pncp_contratacoes",
          registroId: input.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: null,
          descricao: "Registro PNCP (contratação) excluído manualmente.",
        });

        return { message: "Contratação PNCP excluída com sucesso." };
      }

      if (input.tipo === "ATAS") {
        const [before] = await db
          .select()
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.id, input.id))
          .limit(1);
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Registro PNCP não encontrado para exclusão.",
          });
        }

        await db.delete(importacaoPncpAtas).where(eq(importacaoPncpAtas.id, input.id));

        await logAuditoria(ctx, {
          tabela: "importacao_pncp_atas",
          registroId: input.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: null,
          descricao: "Registro PNCP (ata) excluído manualmente.",
        });

        return { message: "Ata PNCP excluída com sucesso." };
      }

      const [before] = await db
        .select()
        .from(importacaoPncpContratos)
        .where(eq(importacaoPncpContratos.id, input.id))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro PNCP não encontrado para exclusão.",
        });
      }

      await db.delete(importacaoPncpContratos).where(eq(importacaoPncpContratos.id, input.id));

      await logAuditoria(ctx, {
        tabela: "importacao_pncp_contratos",
        registroId: input.id,
        acao: "DELETE",
        dadosAnteriores: before,
        dadosNovos: null,
        descricao: "Registro PNCP (contrato) excluído manualmente.",
      });

      return { message: "Contrato PNCP excluído com sucesso." };
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
          paginateAll: false,
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

      const contratacoesTotal =
        (contratacoes as any).totalRegistros ?? contratacoes.total ?? 0;
      const atasTotal = (atas as any).totalRegistros ?? atas.total ?? 0;
      const contratosTotal =
        (contratos as any).totalRegistros ?? contratos.total ?? 0;

      return {
        contratacoes: {
          total: contratacoesTotal,
          amostra: (contratacoes.data ?? []).slice(0, 5).map((c: any) => ({
            numeroControlePNCP:
              c.numeroControlePNCP ?? c.numeroControlePncp ?? null,
            objetoCompra: c.objetoCompra ?? c.objeto ?? null,
            valorTotalEstimado: c.valorTotalEstimado ?? c.valorTotal ?? null,
            dataPublicacaoPncp: c.dataPublicacaoPncp ?? c.dataPublicacao ?? null,
            urlProcesso:
              c.urlProcesso ??
              c.linkProcessoEletronico ??
              c.linkSistemaOrigem ??
              null,
          })),
        },
        atas: {
          total: atasTotal,
          amostra: (atas.data ?? []).slice(0, 5).map((a: any) => ({
            idAtaPNCP:
              a.idAtaPNCP ?? a.idAtaPncp ?? a.numeroControlePNCPAta ?? null,
            numeroAta: a.numeroAta ?? a.numeroAtaRegistroPreco ?? null,
            objeto: a.objeto ?? a.objetoContratacao ?? null,
            dataInicioVigencia: a.dataInicioVigencia ?? a.vigenciaInicio ?? null,
            dataFimVigencia: a.dataFimVigencia ?? a.vigenciaFim ?? null,
          })),
        },
        contratos: {
          total: contratosTotal,
          amostra: (contratos.data ?? []).slice(0, 5).map((c: any) => ({
            idContratoPNCP:
              c.idContratoPNCP ?? c.idContratoPncp ?? c.numeroControlePNCP ?? null,
            numeroContrato: c.numeroContrato ?? c.numeroContratoEmpenho ?? null,
            objeto: c.objeto ?? c.objetoContrato ?? null,
            valorTotal: c.valorTotal ?? c.valorGlobal ?? c.valorParcela ?? null,
            dataAssinatura: c.dataAssinatura,
            fornecedorNome:
              c.fornecedor?.razaoSocial ??
              c.fornecedorNome ??
              c.nomeRazaoSocialFornecedor ??
              null,
          })),
        },
      };
    }),

  listStored: protectedProcedure
    .input(pncpStoredListInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 12;
      const offset = (page - 1) * pageSize;
      const search = input.search?.trim();
      const dataInicio = input.dataInicio ? new Date(input.dataInicio) : null;
      const dataFim = input.dataFim ? new Date(input.dataFim) : null;

      const buildSearch = (fields: any[]) =>
        search ? or(...fields) : undefined;

      const buildRange = (field: any) => {
        const rangeConditions = [];
        if (dataInicio && !Number.isNaN(dataInicio.getTime())) {
          rangeConditions.push(gte(field, dataInicio));
        }
        if (dataFim && !Number.isNaN(dataFim.getTime())) {
          rangeConditions.push(lte(field, dataFim));
        }
        return rangeConditions;
      };

      const buildResponse = async <T extends Record<string, any>>(
        table: any,
        fields: T,
        orderByField: any,
        extraConditions: any[],
      ) => {
        const whereClause = extraConditions.length
          ? and(...extraConditions)
          : sql`true`;
        const listQuery = db
          .select(fields as any)
          .from(table)
          .where(whereClause) as any;
        const countQuery = db
          .select({ count: sql<number>`count(*)` })
          .from(table)
          .where(whereClause);

        const [rows, countRows] = await Promise.all([
          listQuery.orderBy(desc(orderByField)).limit(pageSize).offset(offset),
          countQuery,
        ]);
        const total = Number(countRows?.[0]?.count ?? 0);
        return {
          items: rows,
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
      };

      if (input.tipo === "CONTRATACOES") {
        const conditions = [
          buildSearch([
            ilike(importacaoPncpContratacoes.numeroControlePncp, `%${search ?? ""}%`),
            ilike(importacaoPncpContratacoes.objeto, `%${search ?? ""}%`),
            ilike(importacaoPncpContratacoes.modalidade, `%${search ?? ""}%`),
            ilike(importacaoPncpContratacoes.orgaoEntidadeNome, `%${search ?? ""}%`),
          ]),
          ...buildRange(importacaoPncpContratacoes.dataPublicacao),
        ].filter(Boolean);

        return buildResponse(
          importacaoPncpContratacoes,
          {
            id: importacaoPncpContratacoes.id,
            numeroControlePncp: importacaoPncpContratacoes.numeroControlePncp,
            objeto: importacaoPncpContratacoes.objeto,
            modalidade: importacaoPncpContratacoes.modalidade,
            valorTotalEstimado: importacaoPncpContratacoes.valorTotalEstimado,
            dataPublicacao: importacaoPncpContratacoes.dataPublicacao,
            situacao: importacaoPncpContratacoes.situacao,
            orgaoEntidadeNome: importacaoPncpContratacoes.orgaoEntidadeNome,
          },
          importacaoPncpContratacoes.dataPublicacao,
          conditions as any[],
        );
      }

      if (input.tipo === "ATAS") {
        const conditions = [
          buildSearch([
            ilike(importacaoPncpAtas.numeroAta, `%${search ?? ""}%`),
            ilike(importacaoPncpAtas.objeto, `%${search ?? ""}%`),
            ilike(importacaoPncpAtas.fornecedorNome, `%${search ?? ""}%`),
            ilike(importacaoPncpAtas.orgaoGerenciadorNome, `%${search ?? ""}%`),
          ]),
          ...buildRange(importacaoPncpAtas.dataInicioVigencia),
        ].filter(Boolean);

        return buildResponse(
          importacaoPncpAtas,
          {
            id: importacaoPncpAtas.id,
            idAtaPncp: importacaoPncpAtas.idAtaPncp,
            numeroAta: importacaoPncpAtas.numeroAta,
            objeto: importacaoPncpAtas.objeto,
            fornecedorNome: importacaoPncpAtas.fornecedorNome,
            valorGlobal: importacaoPncpAtas.valorGlobal,
            dataInicioVigencia: importacaoPncpAtas.dataInicioVigencia,
            dataFimVigencia: importacaoPncpAtas.dataFimVigencia,
            situacao: importacaoPncpAtas.situacao,
          },
          importacaoPncpAtas.dataInicioVigencia,
          conditions as any[],
        );
      }

      const conditions = [
        buildSearch([
          ilike(importacaoPncpContratos.numeroContrato, `%${search ?? ""}%`),
          ilike(importacaoPncpContratos.objeto, `%${search ?? ""}%`),
          ilike(importacaoPncpContratos.fornecedorNome, `%${search ?? ""}%`),
        ]),
        ...buildRange(importacaoPncpContratos.dataAssinatura),
      ].filter(Boolean);

      return buildResponse(
        importacaoPncpContratos,
        {
          id: importacaoPncpContratos.id,
          idContratoPncp: importacaoPncpContratos.idContratoPncp,
          numeroContrato: importacaoPncpContratos.numeroContrato,
          objeto: importacaoPncpContratos.objeto,
          fornecedorNome: importacaoPncpContratos.fornecedorNome,
          valorTotal: importacaoPncpContratos.valorTotal,
          dataAssinatura: importacaoPncpContratos.dataAssinatura,
          dataFimVigencia: importacaoPncpContratos.dataFimVigencia,
          situacao: importacaoPncpContratos.situacao,
        },
        importacaoPncpContratos.dataAssinatura,
        conditions as any[],
      );
    }),

  searchProcessos: protectedProcedure
    .input(pncpStoredSearchProcessosInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const search = input.search?.trim();
      const pattern = search ? `%${search}%` : undefined;
      let base: StoredComparable | null = null;

      if (input.tipo === "CONTRATACOES") {
        const [row] = await db
          .select({
            id: importacaoPncpContratacoes.id,
            objeto: importacaoPncpContratacoes.objeto,
            modalidade: importacaoPncpContratacoes.modalidade,
            valor: importacaoPncpContratacoes.valorTotalEstimado,
            processoInternoId: importacaoPncpContratacoes.processoInternoId,
          })
          .from(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id))
          .limit(1);
        base = row ? { ...row, tipo: input.tipo } : null;
      } else if (input.tipo === "ATAS") {
        const [row] = await db
          .select({
            id: importacaoPncpAtas.id,
            objeto: importacaoPncpAtas.objeto,
            modalidade: sql<string | null>`null`,
            valor: importacaoPncpAtas.valorGlobal,
            processoInternoId: importacaoPncpAtas.processoInternoId,
          })
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.id, input.id))
          .limit(1);
        base = row ? { ...row, tipo: input.tipo } : null;
      } else {
        const [row] = await db
          .select({
            id: importacaoPncpContratos.id,
            objeto: importacaoPncpContratos.objeto,
            modalidade: importacaoPncpContratos.modalidade,
            valor: importacaoPncpContratos.valorTotal,
            processoInternoId: importacaoPncpContratos.processoInternoId,
          })
          .from(importacaoPncpContratos)
          .where(eq(importacaoPncpContratos.id, input.id))
          .limit(1);
        base = row ? { ...row, tipo: input.tipo } : null;
      }

      if (!base) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro PNCP não encontrado para conciliação.",
        });
      }

      const filters = [];
      if (pattern) {
        filters.push(
          or(
            ilike(processos.numeroSirel, pattern),
            ilike(processos.numeroAdministrativo, pattern),
            ilike(processos.numeroEdital, pattern),
            ilike(processos.objeto, pattern),
          ),
        );
      }
      const whereClause = filters.length ? and(...filters) : undefined;

      const processRows = await db
        .select({
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          numeroAdministrativo: processos.numeroAdministrativo,
          numeroEdital: processos.numeroEdital,
          objeto: processos.objeto,
          modalidade: modalidades.nome,
          secretaria: secretarias.nome,
          moduloAtual: workflowProcesso.moduloAtual,
          valorEstimado: processos.valorEstimado,
        })
        .from(processos)
        .leftJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
        .where(whereClause)
        .orderBy(desc(processos.atualizadoEm), desc(processos.id))
        .limit(48);

      const ranked = processRows
        .map((row) => {
          const motivos: string[] = [];
          const objetoScore = textSimilarity(base?.objeto, row.objeto);
          const modalidadeScore = textSimilarity(base?.modalidade, row.modalidade);
          const valorScore = valueSimilarity(base?.valor, row.valorEstimado);
          let score = 0;

          if (objetoScore > 0) {
            score += Math.round(objetoScore * 55);
            if (objetoScore >= 0.65) {
              motivos.push("Objeto muito semelhante");
            } else if (objetoScore >= 0.35) {
              motivos.push("Objeto com similaridade moderada");
            }
          }
          if (modalidadeScore > 0) {
            score += Math.round(modalidadeScore * 25);
            if (modalidadeScore >= 0.8) {
              motivos.push("Modalidade compatível");
            }
          }
          if (valorScore > 0) {
            score += Math.round(valorScore * 20);
            if (valorScore >= 0.8) {
              motivos.push("Faixa de valor próxima");
            }
          }

          if (search && normalizeCompareText(row.objeto).includes(normalizeCompareText(search))) {
            score += 8;
          }
          if (base?.processoInternoId && row.processoId === base.processoInternoId) {
            score += 15;
            motivos.push("Processo já vinculado atualmente");
          }

          const nivel = score >= 75 ? "ALTO" : score >= 45 ? "MEDIO" : "BAIXO";

          return {
            processoId: row.processoId,
            numeroSirel: row.numeroSirel,
            numeroAdministrativo: row.numeroAdministrativo,
            numeroEdital: row.numeroEdital,
            objeto: row.objeto,
            modalidade: row.modalidade,
            secretaria: row.secretaria ?? "Sem secretaria",
            moduloAtual: row.moduloAtual,
            valorEstimado: row.valorEstimado ? Number(row.valorEstimado) : null,
            score,
            nivel,
            motivos: motivos.length ? motivos : ["Verificação manual recomendada"],
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, input.pageSize);

      return { items: ranked };
    }),

  linkProcesso: protectedProcedure
    .input(pncpStoredLinkProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();

      const [existingProcess] = await db
        .select({ id: processos.id })
        .from(processos)
        .where(eq(processos.id, input.processoId))
        .limit(1);

      if (!existingProcess) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Processo interno não encontrado.",
        });
      }

      if (input.tipo === "CONTRATACOES") {
        const [before] = await db
          .select()
          .from(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id))
          .limit(1);
        if (!before) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Registro PNCP não encontrado." });
        }

        await db
          .update(importacaoPncpContratacoes)
          .set({ processoInternoId: input.processoId, atualizadoEm: new Date() })
          .where(eq(importacaoPncpContratacoes.id, input.id));

        const [after] = await db
          .select()
          .from(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id))
          .limit(1);

        await logAuditoria(ctx, {
          tabela: "importacao_pncp_contratacoes",
          registroId: input.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: after,
          descricao: `Vínculo manual PNCP → processo interno ${input.processoId}.`,
        });

        return { message: "Vínculo realizado com sucesso." };
      }

      if (input.tipo === "ATAS") {
        const [before] = await db
          .select()
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.id, input.id))
          .limit(1);
        if (!before) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Registro PNCP não encontrado." });
        }

        await db
          .update(importacaoPncpAtas)
          .set({ processoInternoId: input.processoId, atualizadoEm: new Date() })
          .where(eq(importacaoPncpAtas.id, input.id));

        const [after] = await db
          .select()
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.id, input.id))
          .limit(1);

        await logAuditoria(ctx, {
          tabela: "importacao_pncp_atas",
          registroId: input.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: after,
          descricao: `Vínculo manual PNCP → processo interno ${input.processoId}.`,
        });

        return { message: "Vínculo realizado com sucesso." };
      }

      const [before] = await db
        .select()
        .from(importacaoPncpContratos)
        .where(eq(importacaoPncpContratos.id, input.id))
        .limit(1);
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro PNCP não encontrado." });
      }

      await db
        .update(importacaoPncpContratos)
        .set({ processoInternoId: input.processoId, atualizadoEm: new Date() })
        .where(eq(importacaoPncpContratos.id, input.id));

      const [after] = await db
        .select()
        .from(importacaoPncpContratos)
        .where(eq(importacaoPncpContratos.id, input.id))
        .limit(1);

      await logAuditoria(ctx, {
        tabela: "importacao_pncp_contratos",
        registroId: input.id,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: `Vínculo manual PNCP → processo interno ${input.processoId}.`,
      });

      return { message: "Vínculo realizado com sucesso." };
    }),

  unlinkProcesso: protectedProcedure
    .input(pncpStoredUnlinkProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();

      if (input.tipo === "CONTRATACOES") {
        const [before] = await db
          .select()
          .from(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id))
          .limit(1);
        if (!before) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Registro PNCP não encontrado." });
        }
        await db
          .update(importacaoPncpContratacoes)
          .set({ processoInternoId: null, atualizadoEm: new Date() })
          .where(eq(importacaoPncpContratacoes.id, input.id));
        const [after] = await db
          .select()
          .from(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id))
          .limit(1);
        await logAuditoria(ctx, {
          tabela: "importacao_pncp_contratacoes",
          registroId: input.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: after,
          descricao: "Vínculo PNCP removido manualmente.",
        });
        return { message: "Vínculo removido." };
      }

      if (input.tipo === "ATAS") {
        const [before] = await db
          .select()
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.id, input.id))
          .limit(1);
        if (!before) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Registro PNCP não encontrado." });
        }
        await db
          .update(importacaoPncpAtas)
          .set({ processoInternoId: null, atualizadoEm: new Date() })
          .where(eq(importacaoPncpAtas.id, input.id));
        const [after] = await db
          .select()
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.id, input.id))
          .limit(1);
        await logAuditoria(ctx, {
          tabela: "importacao_pncp_atas",
          registroId: input.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: after,
          descricao: "Vínculo PNCP removido manualmente.",
        });
        return { message: "Vínculo removido." };
      }

      const [before] = await db
        .select()
        .from(importacaoPncpContratos)
        .where(eq(importacaoPncpContratos.id, input.id))
        .limit(1);
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro PNCP não encontrado." });
      }
      await db
        .update(importacaoPncpContratos)
        .set({ processoInternoId: null, atualizadoEm: new Date() })
        .where(eq(importacaoPncpContratos.id, input.id));
      const [after] = await db
        .select()
        .from(importacaoPncpContratos)
        .where(eq(importacaoPncpContratos.id, input.id))
        .limit(1);
      await logAuditoria(ctx, {
        tabela: "importacao_pncp_contratos",
        registroId: input.id,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: "Vínculo PNCP removido manualmente.",
      });
      return { message: "Vínculo removido." };
    }),

  getStoredDetail: protectedProcedure
    .input(pncpStoredDetailInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();

      const loadItems = async (tipo: PncpStoredEntity, registroId: number) => {
        if (tipo === "CONTRATACOES") {
          return await db
            .select({
              id: importacaoPncpItensContratacao.id,
              numeroItem: importacaoPncpItensContratacao.numeroItem,
              descricao: importacaoPncpItensContratacao.descricao,
              unidade: importacaoPncpItensContratacao.unidade,
              quantidade: importacaoPncpItensContratacao.quantidade,
              valorUnitario: importacaoPncpItensContratacao.valorUnitario,
              valorTotal: importacaoPncpItensContratacao.valorTotal,
              fornecedorNome: importacaoPncpItensContratacao.fornecedorNome,
              situacao: importacaoPncpItensContratacao.situacao,
            })
            .from(importacaoPncpItensContratacao)
            .where(eq(importacaoPncpItensContratacao.contratacaoId, registroId))
            .orderBy(importacaoPncpItensContratacao.numeroItem);
        }

        if (tipo === "ATAS") {
          return await db
            .select({
              id: importacaoPncpItensAta.id,
              numeroItem: importacaoPncpItensAta.numeroItem,
              descricao: importacaoPncpItensAta.descricao,
              unidade: importacaoPncpItensAta.unidade,
              quantidade: importacaoPncpItensAta.quantidade,
              valorUnitario: importacaoPncpItensAta.valorUnitario,
              valorTotal: importacaoPncpItensAta.valorTotal,
              fornecedorNome: importacaoPncpItensAta.fornecedorNome,
            })
            .from(importacaoPncpItensAta)
            .where(eq(importacaoPncpItensAta.ataId, registroId))
            .orderBy(importacaoPncpItensAta.numeroItem);
        }

        return await db
          .select({
            id: importacaoPncpAditivos.id,
            numeroAditivo: importacaoPncpAditivos.numeroAditivo,
            tipoAditivo: importacaoPncpAditivos.tipoAditivo,
            objeto: importacaoPncpAditivos.objeto,
            valorAditivo: importacaoPncpAditivos.valorAditivo,
            dataAssinatura: importacaoPncpAditivos.dataAssinatura,
            dataFimVigencia: importacaoPncpAditivos.dataFimVigencia,
          })
          .from(importacaoPncpAditivos)
          .where(eq(importacaoPncpAditivos.contratoId, registroId))
          .orderBy(desc(importacaoPncpAditivos.dataAssinatura));
      };

      if (input.tipo === "CONTRATACOES") {
        const [registro] = await db
          .select({
            id: importacaoPncpContratacoes.id,
            numeroControlePncp: importacaoPncpContratacoes.numeroControlePncp,
            objeto: importacaoPncpContratacoes.objeto,
            modalidade: importacaoPncpContratacoes.modalidade,
            modoDisputa: importacaoPncpContratacoes.modoDisputa,
            criterioJulgamento: importacaoPncpContratacoes.criterioJulgamento,
            valorTotalEstimado: importacaoPncpContratacoes.valorTotalEstimado,
            dataPublicacao: importacaoPncpContratacoes.dataPublicacao,
            dataAberturaProposta: importacaoPncpContratacoes.dataAberturaProposta,
            dataEncerramentoProposta: importacaoPncpContratacoes.dataEncerramentoProposta,
            situacao: importacaoPncpContratacoes.situacao,
            orgaoEntidadeNome: importacaoPncpContratacoes.orgaoEntidadeNome,
            urlProcesso: importacaoPncpContratacoes.urlProcesso,
            processoInternoId: importacaoPncpContratacoes.processoInternoId,
            dadosOriginais: importacaoPncpContratacoes.dadosOriginais,
          })
          .from(importacaoPncpContratacoes)
          .where(eq(importacaoPncpContratacoes.id, input.id));

        if (!registro) return null;
        const itens = await loadItems(input.tipo, registro.id);
        const linkedProcess = await loadLinkedProcess(db, registro.processoInternoId);
        return { tipo: input.tipo, registro, itens, linkedProcess };
      }

      if (input.tipo === "ATAS") {
        const [registro] = await db
          .select({
            id: importacaoPncpAtas.id,
            idAtaPncp: importacaoPncpAtas.idAtaPncp,
            numeroAta: importacaoPncpAtas.numeroAta,
            objeto: importacaoPncpAtas.objeto,
            fornecedorNome: importacaoPncpAtas.fornecedorNome,
            valorGlobal: importacaoPncpAtas.valorGlobal,
            dataAssinatura: importacaoPncpAtas.dataAssinatura,
            dataInicioVigencia: importacaoPncpAtas.dataInicioVigencia,
            dataFimVigencia: importacaoPncpAtas.dataFimVigencia,
            situacao: importacaoPncpAtas.situacao,
            urlAta: importacaoPncpAtas.urlAta,
            processoInternoId: importacaoPncpAtas.processoInternoId,
            dadosOriginais: importacaoPncpAtas.dadosOriginais,
          })
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.id, input.id));

        if (!registro) return null;
        const itens = await loadItems(input.tipo, registro.id);
        const linkedProcess = await loadLinkedProcess(db, registro.processoInternoId);
        return { tipo: input.tipo, registro, itens, linkedProcess };
      }

      const [registro] = await db
        .select({
          id: importacaoPncpContratos.id,
          idContratoPncp: importacaoPncpContratos.idContratoPncp,
          numeroContrato: importacaoPncpContratos.numeroContrato,
          objeto: importacaoPncpContratos.objeto,
          modalidade: importacaoPncpContratos.modalidade,
          fornecedorNome: importacaoPncpContratos.fornecedorNome,
          valorTotal: importacaoPncpContratos.valorTotal,
          dataAssinatura: importacaoPncpContratos.dataAssinatura,
          dataInicioVigencia: importacaoPncpContratos.dataInicioVigencia,
          dataFimVigencia: importacaoPncpContratos.dataFimVigencia,
          situacao: importacaoPncpContratos.situacao,
          urlContrato: importacaoPncpContratos.urlContrato,
          processoInternoId: importacaoPncpContratos.processoInternoId,
          dadosOriginais: importacaoPncpContratos.dadosOriginais,
        })
        .from(importacaoPncpContratos)
        .where(eq(importacaoPncpContratos.id, input.id));

      if (!registro) return null;
      const itens = await loadItems(input.tipo, registro.id);
      const linkedProcess = await loadLinkedProcess(db, registro.processoInternoId);
      return { tipo: input.tipo, registro, itens, linkedProcess };
    }),
});







