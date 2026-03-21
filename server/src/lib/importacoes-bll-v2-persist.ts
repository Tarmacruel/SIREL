/**
 * Persistência de Dados Aprimorados - BLL v2.0
 * 
 * Funções para salvar dados normalizados da BLL v2.0 nas novas tabelas:
 * - importacao_bll_processos (com novos campos)
 * - importacao_bll_lotes (novo)
 * - importacao_bll_itens_especificados (novo)
 * - importacao_bll_edicoes_audit (novo)
 */

import { and, eq } from "drizzle-orm";
import { db, requireDb } from "../db/client.js";
import {
  importacaoBllEdicoesAudit,
  importacaoBllItensEspecificados,
  importacaoBllLotes,
  importacaoBllProcessos,
} from "../db/schema.js";
import type {
  EnhancedNormalizedItem,
  EnhancedNormalizedLote,
  EnhancedNormalizedProcess,
} from "./importacoes-bll-v2.js";

/**
 * Persist an enhanced normalized process to the database.
 * Creates records in:
 * - importacao_bll_processos (main process)
 * - importacao_bll_lotes (if lotes exist)
 * - importacao_bll_itens_especificados (items with detailed specs)
 */
export async function persistEnhancedProcess(
  processo: EnhancedNormalizedProcess,
  execucaoId: number,
  ultimosIds?: { processoId?: number } & Record<string, number>,
): Promise<{ processoId: number; lotesIds: number[]; itensIds: number[] }> {
  const database = requireDb();
  const lotesIds: number[] = [];
  const itensIds: number[] = [];

  // Start transaction
  const result = await database.transaction(async (tx: any) => {
    // 1. Insert or update processo
    const processoValues = {
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
      valorReferencia: processo.valorReferencia
        ? Number.parseFloat(processo.valorReferencia)
        : null,
      valorTotal: processo.valorTotal ? Number.parseFloat(processo.valorTotal) : null,
      publicacaoEm: processo.publicacaoEm,
      conclusaoEm: processo.conclusaoEm,
      inicioRecepcaoEm: processo.inicioRecepcaoEm,
      fimRecepcaoEm: processo.fimRecepcaoEm,
      inicioDisputaEm: processo.inicioDisputaEm,
      linkExterno: processo.linkExterno,
      totalLotes: processo.totalLotes,
      totalItens: processo.totalItens,
      ultimaAtualizacaoEm: new Date(),
      dadosOriginais: processo.dadosOriginais,
      // NEW FIELDS - Phase 1
      justificativa: processo.justificativa,
      legislacaoAplicavel: processo.legislacaoAplicavel,
      observacoes: processo.observacoes,
      cotaMe: processo.cotaME,
      completenessScore: processo.dataQuality.completeness,
      lastValidationAt: new Date(),
    };

    // Check if processo exists
    const existing = await tx
      .select({ id: importacaoBllProcessos.id })
      .from(importacaoBllProcessos)
      .where(
        and(
          eq(importacaoBllProcessos.origem, processo.origem),
          eq(importacaoBllProcessos.chaveExterna, processo.chaveExterna),
        ),
      )
      .limit(1);

    let processoId: number;

    if (existing.length > 0) {
      // Update existing
      const updateResult = await tx
        .update(importacaoBllProcessos)
        .set(processoValues)
        .where(eq(importacaoBllProcessos.id, existing[0].id))
        .returning({ id: importacaoBllProcessos.id });
      processoId = updateResult[0].id;

      // Delete existing lotesand itens for refresh
      await tx
        .delete(importacaoBllLotes)
        .where(eq(importacaoBllLotes.processoImportadoId, processoId));
    } else {
      // Insert new
      const insertResult = await tx
        .insert(importacaoBllProcessos)
        .values({
          ...processoValues,
          primeiraCapturaEm: new Date(),
        })
        .returning({ id: importacaoBllProcessos.id });
      processoId = insertResult[0].id;
    }

    // 2. Insert lotes (if any)
    if (processo.lotes.length > 0) {
      for (const lote of processo.lotes) {
        const loteInsertResult = await tx
          .insert(importacaoBllLotes)
          .values({
            processoImportadoId: processoId,
            numero: lote.numero,
            titulo: lote.titulo,
            tipo: lote.tipo,
            faseAtual: lote.faseAtual,
            intervaloMinimoLance: lote.intervaloMinimoLance
              ? Number.parseFloat(lote.intervaloMinimoLance)
              : null,
            exclusivoMe: lote.exclusivoME,
            localEntrega: lote.localEntrega,
            garantiaExigida: lote.garantiaExigida,
            valorReferencia: lote.valorReferencia
              ? Number.parseFloat(lote.valorReferencia)
              : null,
            valorHomologado: lote.valorHomologado
              ? Number.parseFloat(lote.valorHomologado)
              : null,
            vencedor: lote.vencedor,
            dadosOriginais: lote.dadosOriginais,
            criadoEm: new Date(),
            atualizadoEm: new Date(),
          })
          .returning({ id: importacaoBllLotes.id });

        const loteId = loteInsertResult[0].id;
        lotesIds.push(loteId);

        // 3. Insert itens for this lote
        for (const item of lote.itens) {
          const itemInsertResult = await tx
            .insert(importacaoBllItensEspecificados)
            .values({
              loteImportadoId: loteId,
              processoImportadoId: processoId,
              numeroItem: item.numero,
              codigoCatalogo: item.codigoCatalogo,
              descricaoResumida: item.descricaoResumida,
              especificacaoTecnica: item.especificacaoTecnica,
              unidadeMedida: item.unidadeMedida,
              quantidade: item.quantidade,
              valorReferenciaUnitario: item.valorReferenciaUnitario,
              valorHomologadoUnitario: item.valorHomologadoUnitario,
              subtotalReferencia: item.quantidade
                && item.valorReferenciaUnitario
                ? (item.quantidade * item.valorReferenciaUnitario).toFixed(2)
                : null,
              subtotalHomologado: item.quantidade
                && item.valorHomologadoUnitario
                ? (item.quantidade * item.valorHomologadoUnitario).toFixed(2)
                : null,
              fornecedorHomologado: item.fornecedorHomologado,
              marcaHomologada: item.marcaHomologada,
              modeloHomologado: item.modeloHomologado,
              dadosOriginais: item.dadosOriginais,
              criadoEm: new Date(),
              atualizadoEm: new Date(),
            })
            .returning({ id: importacaoBllItensEspecificados.id });

          itensIds.push(itemInsertResult[0].id);
        }
      }
    }

    return { processoId, lotesIds, itensIds };
  });

  return result;
}

/**
 * Audit trail for post-import edits
 * Records who changed what and why
 */
export async function logImportEditAudit(
  processoImportadoId: number,
  usuarioId: number,
  camposAlterados: Array<{
    field: string;
    oldValue: string | number | boolean | null;
    newValue: string | number | boolean | null;
  }>,
  justificativa: string,
  origemEdicao: "MANUAL" | "IMPORTACAO_BLL" | "PNCP_SYNC" = "MANUAL",
): Promise<number> {
  const database = requireDb();

  const result = await database
    .insert(importacaoBllEdicoesAudit)
    .values({
      processoImportadoId,
      usuarioId,
      camposAlterados: camposAlterados,
      justificativa,
      origemEdicao,
      criadoEm: new Date(),
    })
    .returning({ id: importacaoBllEdicoesAudit.id });

  return result[0].id;
}

/**
 * Calculate completeness score for a processo
 * Based on presence of critical and important fields
 */
export function calculateCompletenessScore(
  processo: EnhancedNormalizedProcess,
): number {
  const criticalFields = [
    "objeto",
    "modalidade",
    "publicacaoEm",
    "numeroEdital",
  ];
  const importantFields = [
    "justificativa",
    "legislacaoAplicavel",
    "artigo",
    "inciso",
    "valorTotal",
    "conclusaoEm",
  ];

  let score = 0;
  let totalWeight = 0;

  // Critical fields: 60% of score
  for (const field of criticalFields) {
    totalWeight += 15; // 4 fields * 15 = 60
    const value = processo[field as keyof EnhancedNormalizedProcess];
    if (value && String(value).trim()) {
      score += 15;
    }
  }

  // Important fields: 40% of score
  for (const field of importantFields) {
    totalWeight += 6.67; // 6 fields * 6.67 ≈ 40
    const value = processo[field as keyof EnhancedNormalizedProcess];
    if (value && String(value).trim()) {
      score += 6.67;
    }
  }

  // Lotes and itens structure: bonus
  if (processo.lotes.length > 0) {
    score = Math.min(100, score + 5);
  }

  // Technical specs preservation: bonus
  if (
    processo.lotes.some((l) =>
      l.itens.some((i) => i.especificacaoTecnica && i.especificacaoTecnica.length > 20),
    )
  ) {
    score = Math.min(100, score + 5);
  }

  return Math.round(Math.min(100, (score / totalWeight) * 100));
}
