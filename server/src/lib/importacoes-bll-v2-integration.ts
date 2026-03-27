/**
 * Integração BLL v2.0 - Camada de Ponte
 * 
 * Responsável por conectar:
 * - Normalização v2 (com preservação completa)
 * - Persistência v2 (lotes, itens especificados, audit)  
 * - Com a estrutura v1 existente (backward compatibility)
 */

import { and, eq } from "drizzle-orm";
import type { ImportacaoBllSource } from "@sirel/shared/schemas/importacoes";

import { requireDb } from "../db/client.js";
import {
  importacaoBllEdicoesAudit,
  importacaoBllExecucoes,
  importacaoBllFornecedores,
  importacaoBllItens,
  importacaoBllItensEspecificados,
  importacaoBllLotes,
  importacaoBllProcessos,
} from "../db/schema.js";
import { refreshConciliationForImportedIds } from "./importacoes-conciliacao.js";
import {
  normalizeEnhancedDataset as normalizeWithV2,
  normalizeText,
  validateImportQuality,
} from "./importacoes-bll-v2.js";
import { remoteImportSources } from "./importacoes-bll.js";

/**
 * Persiste dados normalizados combinando v1 (compatibilidade) + v2 (preservação)
 */
export async function persistEnhancedNormalizedDataset(options: {
  origem: ImportacaoBllSource;
  modo: "REMOTA_JSON" | "CSV_MANUAL";
  criadoPor?: number | null;
  agendada?: boolean;
  referenciaRotina?: string | null;
  urlFonte?: string | null;
  arquivoRegistrosNome?: string | null;
  arquivoItensNome?: string | null;
  dataset: ReturnType<typeof normalizeWithV2>;
}): Promise<{
  executionId: number;
  origem: ImportacaoBllSource;
  totalRegistros: number;
  totalItens: number;
  totalLotes: number;
  scoreQualidadeMedia: number;
  status: "CONCLUIDA" | "ERRO";
  atualizadoFonteEm: Date | null;
}> {
  const db = requireDb();

  // Criar registro de execução
  const [execution] = await db
    .insert(importacaoBllExecucoes)
    .values({
      origem: options.origem,
      modo: options.modo,
      status: "PROCESSANDO",
      agendada: options.agendada ?? false,
      referenciaRotina: options.referenciaRotina ?? null,
      urlFonte: options.urlFonte ?? null,
      arquivoRegistrosNome: options.arquivoRegistrosNome ?? null,
      arquivoItensNome: options.arquivoItensNome ?? null,
      atualizadoFonteEm: options.dataset.atualizadoFonteEm,
      detalhes: {
        qualityReport: options.dataset.qualityReport,
        ...options.dataset.detalhes,
      },
      criadoPor: options.criadoPor ?? null,
    })
    .returning({ id: importacaoBllExecucoes.id });

  try {
    let totalLotes = 0;
    const importedIds: number[] = [];
    const qualityScores: number[] = [];
    const fornecedorCache = new Map<string, number>();

    const normalizeDocumento = (value?: string | null) => {
      const digits = String(value ?? "").replace(/\D+/g, "");
      if (!digits) return null;
      if (digits.length === 11 || digits.length === 14) return digits;
      return null;
    };

    const normalizeFornecedorKey = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    const clampText = (value: unknown, max: number) => {
      const text = normalizeText(value);
      return text ? text.slice(0, max) : null;
    };

    const MAX_NUMERIC_14_4 = 9999999999.9999;
    const MAX_NUMERIC_14_2 = 999999999999.99;

    const formatNumeric = (
      value: number | null | undefined,
      scale: number,
      maxAbs: number,
    ) => {
      if (value === null || value === undefined) return null;
      const num = Number(value);
      if (!Number.isFinite(num) || Math.abs(num) > maxAbs) return null;
      return num.toFixed(scale);
    };

    const safeQuantidade = (value: number | null | undefined) =>
      formatNumeric(value, 4, MAX_NUMERIC_14_4);
    const safeValor = (value: number | null | undefined) =>
      formatNumeric(value, 2, MAX_NUMERIC_14_2);

    const extractDocumentoFromText = (value?: string | null) => {
      const digits = String(value ?? "").replace(/\D+/g, "");
      if (digits.length === 11 || digits.length === 14) return digits;
      return null;
    };

    const ensureFornecedor = async (
      tx: any,
      nomeRaw?: string | null,
      documentoRaw?: string | null,
      dadosOriginais?: unknown,
    ) => {
      const nome = normalizeText(nomeRaw);
      if (!nome) return null;

      const documento =
        normalizeDocumento(documentoRaw) ?? extractDocumentoFromText(nomeRaw);
      const nomeNormalizado = normalizeFornecedorKey(nome);
      const cacheKey = documento
        ? `doc:${documento}`
        : `nome:${nomeNormalizado}`;

      if (fornecedorCache.has(cacheKey)) {
        return fornecedorCache.get(cacheKey) ?? null;
      }

      const conflictTarget = documento
        ? [importacaoBllFornecedores.documento]
        : [importacaoBllFornecedores.nomeNormalizado];

      const [saved] = await tx
        .insert(importacaoBllFornecedores)
        .values({
          nome,
          nomeNormalizado,
          documento,
          dadosOriginais: dadosOriginais ?? null,
          atualizadoEm: new Date(),
        })
        .onConflictDoUpdate({
          target: conflictTarget,
          set: {
            nome,
            nomeNormalizado,
            documento,
            dadosOriginais: dadosOriginais ?? null,
            atualizadoEm: new Date(),
          },
        })
        .returning({ id: importacaoBllFornecedores.id });

      if (saved?.id) {
        fornecedorCache.set(cacheKey, saved.id);
        return saved.id;
      }

      return null;
    };

    // Processar cada processo normalizado
    await db.transaction(async (tx) => {
      for (const processo of options.dataset.registros) {
        // 1. Salvar processo em v1 (compatibilidade)
        const [savedProcess] = await tx
          .insert(importacaoBllProcessos)
          .values({
            origem: processo.origem,
            chaveExterna: processo.chaveExterna,
            idOrigem: processo.idOrigem,
            numeroEdital: processo.numeroEdital,
            numeroAdministrativo: processo.numeroAdministrativo,
            anoReferencia: processo.anoReferencia,
            modalidade: processo.modalidade,
            situacaoExterna: processo.situacaoExterna,
            tipoContrato: processo.tipoContrato,
            artigo: processo.artigo,
            inciso: processo.inciso,
            objeto: processo.objeto,
            condutorNome: processo.condutorNome,
            coordenadorNome: processo.coordenadorNome,
            autoridadeNome: processo.autoridadeNome,
            fornecedorNome: processo.fornecedorNome,
            valorReferencia: processo.valorReferencia,
            valorTotal: processo.valorTotal,
            publicacaoEm: processo.publicacaoEm,
            conclusaoEm: processo.conclusaoEm,
            inicioRecepcaoEm: processo.inicioRecepcaoEm,
            fimRecepcaoEm: processo.fimRecepcaoEm,
            inicioDisputaEm: processo.inicioDisputaEm,
            linkExterno: processo.linkExterno,
            totalLotes: processo.totalLotes,
            totalItens: processo.totalItens,
            ultimaExecucaoId: execution.id,
            ultimaAtualizacaoEm: new Date(),
            dadosOriginais: processo.dadosOriginais,
            // NOVA FASE 1: Campos críticos preservados
            justificativa: processo.justificativa,
            legislacaoAplicavel: processo.legislacaoAplicavel,
            observacoes: processo.observacoes,
            cotaMe: processo.cotaME,
            completenessScore: processo.dataQuality.completeness,
            lastValidationAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              importacaoBllProcessos.origem,
              importacaoBllProcessos.chaveExterna,
            ],
            set: {
              idOrigem: processo.idOrigem,
              numeroEdital: processo.numeroEdital,
              numeroAdministrativo: processo.numeroAdministrativo,
              anoReferencia: processo.anoReferencia,
              modalidade: processo.modalidade,
              situacaoExterna: processo.situacaoExterna,
              tipoContrato: processo.tipoContrato,
              artigo: processo.artigo,
              inciso: processo.inciso,
              objeto: processo.objeto,
              condutorNome: processo.condutorNome,
              coordenadorNome: processo.coordenadorNome,
              autoridadeNome: processo.autoridadeNome,
              fornecedorNome: processo.fornecedorNome,
              valorReferencia: processo.valorReferencia,
              valorTotal: processo.valorTotal,
              publicacaoEm: processo.publicacaoEm,
              conclusaoEm: processo.conclusaoEm,
              inicioRecepcaoEm: processo.inicioRecepcaoEm,
              fimRecepcaoEm: processo.fimRecepcaoEm,
              inicioDisputaEm: processo.inicioDisputaEm,
              linkExterno: processo.linkExterno,
              totalLotes: processo.totalLotes,
              totalItens: processo.totalItens,
              ultimaExecucaoId: execution.id,
              ultimaAtualizacaoEm: new Date(),
              dadosOriginais: processo.dadosOriginais,
              // NOVA FASE 1: Update campos críticos
              justificativa: processo.justificativa,
              legislacaoAplicavel: processo.legislacaoAplicavel,
              observacoes: processo.observacoes,
              cotaMe: processo.cotaME,
              completenessScore: processo.dataQuality.completeness,
              lastValidationAt: new Date(),
            },
          })
          .returning({ id: importacaoBllProcessos.id });

        importedIds.push(savedProcess.id);
        qualityScores.push(processo.dataQuality.completeness);

        await ensureFornecedor(
          tx,
          processo.fornecedorNome,
          null,
          processo.dadosOriginais,
        );

        // 2. Salvar itens v1 (compatibilidade - lista plana)
        await tx
          .delete(importacaoBllItens)
          .where(
            eq(importacaoBllItens.processoImportadoId, savedProcess.id),
          );
        await tx
          .delete(importacaoBllItensEspecificados)
          .where(
            eq(importacaoBllItensEspecificados.processoImportadoId, savedProcess.id),
          );
        await tx
          .delete(importacaoBllLotes)
          .where(eq(importacaoBllLotes.processoImportadoId, savedProcess.id));

        if (processo.itens.length) {
          const itemRows = [];
          for (const item of processo.itens) {
            const fornecedorId = await ensureFornecedor(
              tx,
              item.fornecedorHomologado,
              null,
              item.dadosOriginais,
            );
            itemRows.push({
              processoImportadoId: savedProcess.id,
              fornecedorImportadoId: fornecedorId,
              loteNumero: clampText(item.loteNumero, 128),
              itemNumero: clampText(item.numero, 128),
              descricao: item.especificacaoTecnica || item.descricaoResumida,
              unidade: item.unidadeMedida,
              quantidade: safeQuantidade(item.quantidade),
              fornecedorNome: item.fornecedorHomologado,
              marca: item.marcaHomologada,
              modelo: item.modeloHomologado,
              valorReferencia: safeValor(item.valorReferenciaUnitario),
              valorUnitario: safeValor(item.valorHomologadoUnitario),
              subtotal:
                item.quantidade && item.valorHomologadoUnitario
                  ? safeValor(item.quantidade * item.valorHomologadoUnitario)
                  : null,
              dadosOriginais: item.dadosOriginais,
              atualizadoEm: new Date(),
            });
          }
          if (itemRows.length) {
            await tx.insert(importacaoBllItens).values(itemRows);
          }
        }

        // 3. NOVA FASE 1: Salvar lotes + itens especificados (preservação completa)
        if (processo.lotes.length > 0) {
          totalLotes += processo.lotes.length;

          for (const lote of processo.lotes) {
            const vencedorFornecedorId = await ensureFornecedor(
              tx,
              lote.vencedor,
              null,
              lote.dadosOriginais,
            );
            const [savedLote] = await tx
              .insert(importacaoBllLotes)
              .values({
                processoImportadoId: savedProcess.id,
                numero: lote.numero,
                titulo: lote.titulo,
                tipo: lote.tipo,
                faseAtual: lote.faseAtual,
                intervaloMinimoLance: lote.intervaloMinimoLance,
                exclusivoMe: lote.exclusivoME,
                localEntrega: lote.localEntrega,
                garantiaExigida: lote.garantiaExigida,
                valorReferencia: lote.valorReferencia,
                valorHomologado: lote.valorHomologado,
                vencedor: lote.vencedor,
                vencedorFornecedorId,
                dadosOriginais: lote.dadosOriginais,
                criadoEm: new Date(),
                atualizadoEm: new Date(),
              })
              .returning({ id: importacaoBllLotes.id });

            // Salvar itens com especificações técnicas completas
            if (lote.itens.length) {
              const itensRows = [];
              for (const item of lote.itens) {
                const fornecedorId = await ensureFornecedor(
                  tx,
                  item.fornecedorHomologado,
                  null,
                  item.dadosOriginais,
                );
                itensRows.push({
                  loteImportadoId: savedLote.id,
                  processoImportadoId: savedProcess.id,
                  fornecedorImportadoId: fornecedorId,
                  numeroItem: item.numero,
                  codigoCatalogo: item.codigoCatalogo,
                  descricaoResumida: item.descricaoResumida,
                  // CRÍTICO: Preservar especificação técnica completa
                  especificacaoTecnica: item.especificacaoTecnica,
                  unidadeMedida: item.unidadeMedida,
                  quantidade: safeQuantidade(item.quantidade),
                  valorReferenciaUnitario: safeValor(item.valorReferenciaUnitario),
                  valorHomologadoUnitario: safeValor(item.valorHomologadoUnitario),
                  subtotalReferencia:
                    item.quantidade && item.valorReferenciaUnitario
                      ? safeValor(item.quantidade * item.valorReferenciaUnitario)
                      : null,
                  subtotalHomologado:
                    item.quantidade && item.valorHomologadoUnitario
                      ? safeValor(item.quantidade * item.valorHomologadoUnitario)
                      : null,
                  fornecedorHomologado: item.fornecedorHomologado,
                  marcaHomologada: item.marcaHomologada,
                  modeloHomologado: item.modeloHomologado,
                  dadosOriginais: item.dadosOriginais,
                  criadoEm: new Date(),
                  atualizadoEm: new Date(),
                });
              }
              if (itensRows.length) {
                await tx.insert(importacaoBllItensEspecificados).values(itensRows);
              }
            }
          }
        }
      }
    });

    // Calcular score médio de qualidade
    const scoreMediaQualidade =
      qualityScores.length > 0
        ? Math.round(
            qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length,
          )
        : 0;

    // Atualizar status de execução
    const totalItens = options.dataset.registros.reduce(
      (acc, r) => acc + r.totalItens,
      0,
    );
    await db
      .update(importacaoBllExecucoes)
      .set({
        status: "CONCLUIDA",
        totalRegistros: options.dataset.registros.length,
        totalItens,
        mensagem: `Importação v2 concluída: ${options.dataset.registros.length} registro(s), ${totalItens} item(ns), ${totalLotes} lote(s), score médio ${scoreMediaQualidade}%`,
        finalizadoEm: new Date(),
      })
      .where(eq(importacaoBllExecucoes.id, execution.id));

    // Executar conciliação automática
    await refreshConciliationForImportedIds(importedIds);

    return {
      executionId: execution.id,
      origem: options.origem,
      totalRegistros: options.dataset.registros.length,
      totalItens,
      totalLotes,
      scoreQualidadeMedia: scoreMediaQualidade,
      status: "CONCLUIDA",
      atualizadoFonteEm: options.dataset.atualizadoFonteEm,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao processar a importação.";
    await db
      .update(importacaoBllExecucoes)
      .set({
        status: "ERRO",
        mensagem: `[v2.0] ${message}`,
        finalizadoEm: new Date(),
      })
      .where(eq(importacaoBllExecucoes.id, execution.id));
    throw error;
  }
}

/**
 * Exportar referências para uso em routers
 */
export { normalizeWithV2, validateImportQuality };


