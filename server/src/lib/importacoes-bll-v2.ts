/**
 * Normalizador BLL v2.0 - Enhanced Data Preservation Module
 * 
 * Phase 1: Preserves critical fields that were being lost:
 * - Justificativa (legal justification for dispensas/inexigibilidades)
 * - Legislacao (reference to applicable legislation)
 * - Observacoes (operational notes)
 * - Lotes with hierarchical structure
 * - Itens with complete technical specifications
 * 
 * This module builds on the existing importacoes-bll.ts but extends it to:
 * 1. Extract and normalize lotes with all details
 * 2. Preserve complete technical specifications for items
 * 3. Calculate data quality metrics
 * 4. Enable future PNCP conciliation
 */

import { sql } from "drizzle-orm";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface EnhancedNormalizedLote {
  numero: string;
  titulo: string;
  tipo: "GLOBAL" | "ITEM" | "LOTE" | null;
  faseAtual: string | null;
  intervaloMinimoLance: string | null;
  exclusivoME: boolean;
  localEntrega: string | null;
  garantiaExigida: string | null;
  valorReferencia: string | null;
  valorHomologado: string | null;
  vencedor: string | null;
  itens: EnhancedNormalizedItem[];
  dadosOriginais: Record<string, unknown>;
}

export interface EnhancedNormalizedItem {
  numero: string;
  loteNumero: string | null;
  codigoCatalogo: string | null;
  descricaoResumida: string;
  especificacaoTecnica: string | null;
  unidadeMedida: string | null;
  quantidade: number | null;
  valorReferenciaUnitario: number | null;
  valorHomologadoUnitario: number | null;
  fornecedorHomologado: string | null;
  marcaHomologada: string | null;
  modeloHomologado: string | null;
  dadosOriginais: Record<string, unknown>;
}

export interface EnhancedNormalizedProcess {
  // Campos originais - compatibilidade com v1
  origem: "LICITACAO" | "COMPRA_DIRETA";
  chaveExterna: string;
  idOrigem: string | null;
  numeroEdital: string | null;
  numeroAdministrativo: string | null;
  anoReferencia: number | null;
  modalidade: string;
  situacaoExterna: string | null;
  tipoContrato: string | null;
  artigo: string | null;
  inciso: string | null;
  objeto: string;
  condutorNome: string | null;
  coordenadorNome: string | null;
  autoridadeNome: string | null;
  fornecedorNome: string | null;
  valorReferencia: string | null;
  valorTotal: string | null;
  publicacaoEm: Date | null;
  conclusaoEm: Date | null;
  inicioRecepcaoEm: Date | null;
  fimRecepcaoEm: Date | null;
  inicioDisputaEm: Date | null;
  linkExterno: string | null;
  totalLotes: number;
  totalItens: number;
  dadosOriginais: Record<string, unknown>;
  
  // NOVOS CAMPOS - Phase 1 Data Preservation
  justificativa: string | null;
  legislacaoAplicavel: string | null;
  observacoes: string | null;
  cotaME: boolean;
  
  // Estrutura hierárquica completa
  lotes: EnhancedNormalizedLote[];
  
  // Qualidade dos dados
  dataQuality: {
    completeness: number; // 0-100%
    missingCriticalFields: string[];
    warnings: string[];
  };
  
  // Para compatibilidade com v1
  itens: EnhancedNormalizedItem[]; // Flatmap de todos os itens de todos os lotes
}

// ============================================================================
// UTILITY FUNCTIONS (Extended from importacoes-bll.ts)
// ============================================================================

export function normalizeText(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/\u00a0/g, " ") // Non-breaking space
    .replace(/\s+/g, " ") // Multiple spaces
    .trim();
  return text ? text : null;
}

export function normalizeTextPreserveLines(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  return text ? text : null;
}

export function parseBrazilianNumber(value: unknown, scale = 2): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(scale);
}

export function parseBrazilianDateTime(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Format: DD/MM/YYYY ou DD/MM/YYYY HH:mm:ss
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
    const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseInteger(value: unknown): number {
  const digits = String(value ?? "").replace(/[^\d-]+/g, "");
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Extract CATMAT/SIASG code from specification text
 * Pattern: 10-12 digit codes at the start (e.g., "5707611122 ROUTEBOARD...")
 */
export function extractCatalogCode(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/^(\d{10,12})\s+/);
  return match ? match[1] : null;
}

// ============================================================================
// ENHANCED NORMALIZATION: LOTES AND ITENS
// ============================================================================

export function normalizeEnhancedLote(
  loteData: Record<string, unknown>,
  processoOrigin: "LICITACAO" | "COMPRA_DIRETA",
  index = 0,
): EnhancedNormalizedLote {
  // Extrair itens do lote (estrutura específica da BLL)
  const itensRaw = Array.isArray(loteData.itens) ? loteData.itens : [];
  
  const itens = itensRaw.map((item: Record<string, unknown>) =>
    normalizeEnhancedItem(item, loteData),
  );

  return {
    numero: normalizeText(loteData.numero) || `LOTE-${index + 1}`,
    titulo: normalizeText(loteData.titulo) || 
            normalizeText(loteData.especificacao?.toString().slice(0, 200)) ||
            "Lote sem descrição",
    tipo: normalizeText(loteData.tipo) as "GLOBAL" | "ITEM" | "LOTE" | null,
    faseAtual: normalizeText(loteData.fase),
    intervaloMinimoLance: parseBrazilianNumber(loteData.intervalo_minimo),
    exclusivoME: normalizeText(loteData.exclusivo_me) === "SIM",
    localEntrega: normalizeText(loteData.local_entrega),
    garantiaExigida: normalizeText(loteData.garantia),
    valorReferencia: parseBrazilianNumber(loteData.valor_referencia),
    valorHomologado: parseBrazilianNumber(loteData.melhor_oferta),
    vencedor: normalizeText(loteData.vencedor),
    itens,
    dadosOriginais: loteData,
  };
}

export function normalizeEnhancedItem(
  itemData: Record<string, unknown>,
  lotePaiData: Record<string, unknown> = {},
): EnhancedNormalizedItem {
  const especificacao = normalizeTextPreserveLines(
    itemData.especificacao || itemData.descricao || itemData.especificacaoTecnica,
  );

  return {
    numero:
      normalizeText(itemData.numero) ||
      normalizeText(itemData.itemNumero) ||
      normalizeText(itemData.numeroItem) ||
      `ITEM-${Date.now()}`,
    loteNumero:
      normalizeText(itemData.loteNumero) ||
      normalizeText(itemData.lote) ||
      normalizeText(lotePaiData.numero),
    codigoCatalogo: extractCatalogCode(especificacao),
    descricaoResumida:
      normalizeText(
        especificacao?.split(/[:\n]/)[0] ||
          itemData.descricao ||
          itemData.descricaoResumida ||
          "Item sem descrição",
      ) || "Item sem descrição",
    // CRÍTICO: Preserve complete technical specification
    especificacaoTecnica: especificacao,
    unidadeMedida:
      normalizeText(itemData.unidade) ||
      normalizeText(itemData.unidadeMedida) ||
      normalizeText(itemData.unidade_medida),
    quantidade: (() => {
      const raw =
        itemData.quantidade ??
        itemData.quantidadeUnitario ??
        itemData.quantidade_unitario ??
        itemData.qtd;
      const parsed = parseBrazilianNumber(raw, 4);
      return parsed ? Number.parseFloat(parsed) : null;
    })(),
    valorReferenciaUnitario: (() => {
      const raw =
        itemData.valorReferencia ??
        itemData.valor_referencia ??
        itemData.valorReferenciaUnitario ??
        itemData.valor_unitario ??
        itemData.valor;
      const parsed = parseBrazilianNumber(raw);
      return parsed ? Number.parseFloat(parsed) : null;
    })(),
    valorHomologadoUnitario: (() => {
      const raw =
        itemData.valorHomologadoUnitario ??
        itemData.valorHomologado ??
        itemData.valor_unitario ??
        itemData.valor;
      const parsed = parseBrazilianNumber(raw);
      return parsed ? Number.parseFloat(parsed) : null;
    })(),
    fornecedorHomologado:
      normalizeText(lotePaiData.vencedor || itemData.fornecedor || itemData.fornecedorHomologado),
    marcaHomologada:
      normalizeText(itemData.marca || lotePaiData.marca || itemData.marcaHomologada),
    modeloHomologado:
      normalizeText(itemData.modelo || lotePaiData.modelo || itemData.modeloHomologada),
    dadosOriginais: itemData,
  };
}

function normalizeEnhancedItemFromFlat(
  itemData: Record<string, unknown>,
): EnhancedNormalizedItem {
  return normalizeEnhancedItem(
    {
      loteNumero: itemData.loteNumero ?? itemData.lote,
      numero: itemData.itemNumero ?? itemData.numeroItem ?? itemData.numero,
      descricao: itemData.descricao,
      especificacao: itemData.especificacao,
      unidade: itemData.unidade,
      quantidade: itemData.quantidade,
      fornecedor: itemData.fornecedorNome ?? itemData.fornecedor,
      marca: itemData.marca,
      modelo: itemData.modelo,
      valor_referencia:
        itemData.valorReferencia ?? itemData.valor_referencia ?? itemData.valorReferenciaUnitario,
      valor_unitario:
        itemData.valorUnitario ?? itemData.valor_unitario ?? itemData.valorHomologadoUnitario,
      dadosOriginais: itemData,
    },
    {},
  );
}

// ============================================================================
// ENHANCED PROCESS NORMALIZATION
// ============================================================================

export function normalizeEnhancedProcess(
  processoJson: Record<string, unknown>,
  origem: "LICITACAO" | "COMPRA_DIRETA",
): EnhancedNormalizedProcess {
  // Extract lotes structure (exists only for licitações)
  const lotesRaw = Array.isArray(processoJson.lotes) ? processoJson.lotes : [];
  const seenLoteNumbers = new Set<string>();
  const lotes = lotesRaw.map((lote: Record<string, unknown>, index: number) => {
    const normalized = normalizeEnhancedLote(lote, origem, index);
    let numero = normalized.numero;
    if (seenLoteNumbers.has(numero)) {
      let suffix = 2;
      while (seenLoteNumbers.has(`${numero}-${suffix}`)) {
        suffix += 1;
      }
      numero = `${numero}-${suffix}`;
    }
    seenLoteNumbers.add(numero);
    return { ...normalized, numero };
  });

  const lotesItens = lotes.flatMap((lote) => lote.itens);

  // Extra compatibility: flat item list (v1 style) may be on processoJson.itens
  const itensRaw = Array.isArray(processoJson.itens) ? processoJson.itens : [];
  const itensFromFlat = itensRaw
    .map((item) =>
      item && typeof item === "object"
        ? normalizeEnhancedItemFromFlat(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is EnhancedNormalizedItem => item !== null);

  const allItens = [...lotesItens, ...itensFromFlat];

  // Calculate data quality metrics
  const criticalFields = ["objeto", "modalidade", "publicacao"];
  const missingCritical = criticalFields.filter(
    (f) => !processoJson[f] || String(processoJson[f]).trim() === "",
  );
  
  const completeness = Math.round(
    ((criticalFields.length - missingCritical.length) / criticalFields.length) * 100,
  );

  const warnings = generateDataWarnings(processoJson, lotes);
  const cotaME = lotes.some((lote) => lote.exclusivoME);

  return {
    // Original fields v1
    origem,
    chaveExterna:
      normalizeText(
        processoJson.chaveExterna ??
          processoJson.id ??
          processoJson.numero_edital ??
          processoJson.numeroEdital ??
          processoJson.numeroAdministrativo ??
          processoJson.numero_adm,
      ) || `${Date.now()}`,
    idOrigem:
      normalizeText(
        processoJson.idOrigem ??
          processoJson.id ??
          processoJson.numero_adm ??
          processoJson.numeroAdministrativo,
      ),
    numeroEdital:
      normalizeText(
        processoJson.numeroEdital ??
          processoJson.numero_edital ??
          processoJson.id ??
          processoJson.numero_adm,
      ),
    numeroAdministrativo:
      normalizeText(
        processoJson.numeroAdministrativo ??
          processoJson.numero_adm ??
          processoJson.numero_administrativo ??
          processoJson.numeroEdital ??
          processoJson.id,
      ),
    anoReferencia:
      parseInteger(
        processoJson.anoReferencia ?? processoJson.ano_referencia,
      ) || new Date().getFullYear(),
    modalidade:
      normalizeText(processoJson.modalidade ?? processoJson.modalidade_nome) ||
      "NÃO ESPECIFICADO",
    situacaoExterna:
      normalizeText(processoJson.situacao || processoJson.status),
    tipoContrato:
      normalizeText(processoJson.tipoContrato ?? processoJson.tipo_contrato),
    artigo: normalizeText(processoJson.artigo),
    inciso: normalizeText(processoJson.inciso),
    objeto:
      normalizeText(processoJson.objeto ?? processoJson.objeto_processo) ||
      "Objeto não informado",
    condutorNome:
      normalizeText(
        processoJson.condutorNome ??
          processoJson.condutor ??
          processoJson.coordenador ??
          processoJson.coordenadorNome,
      ),
    coordenadorNome:
      normalizeText(
        processoJson.coordenadorNome ??
          processoJson.coordenador ??
          processoJson.condutor ??
          processoJson.condutorNome,
      ),
    autoridadeNome:
      normalizeText(
        processoJson.autoridadeNome ??
          processoJson.autoridade ??
          processoJson.autoridadeNome ??
          processoJson.autoridade_responsavel,
      ),
    fornecedorNome:
      normalizeText(
        processoJson.fornecedorNome ??
          processoJson.fornecedor ??
          processoJson.promotor ??
          processoJson.fiscal,
      ),
    valorReferencia:
      parseBrazilianNumber(
        processoJson.valorReferencia ?? processoJson.valor_referencia,
      ),
    valorTotal:
      parseBrazilianNumber(processoJson.valorTotal ?? processoJson.valor_total),
    publicacaoEm:
      parseBrazilianDateTime(
        processoJson.publicacaoEm ??
          processoJson.data_publicacao ??
          processoJson.publicacao ??
          processoJson.dataPublicacao,
      ),
    conclusaoEm:
      parseBrazilianDateTime(
        processoJson.conclusaoEm ??
          processoJson.data_conclusao ??
          processoJson.conclusao ??
          processoJson.dataConclusao,
      ),
    inicioRecepcaoEm:
      parseBrazilianDateTime(
        processoJson.inicioRecepcaoEm ?? processoJson.inicio_recepcao,
      ),
    fimRecepcaoEm:
      parseBrazilianDateTime(
        processoJson.fimRecepcaoEm ?? processoJson.fim_recepcao,
      ),
    inicioDisputaEm:
      parseBrazilianDateTime(
        processoJson.inicioDisputaEm ?? processoJson.inicio_disputa,
      ),
    linkExterno:
      normalizeText(
        processoJson.linkExterno ??
          processoJson.link ??
          processoJson.url ??
          processoJson.endereco,
      ),
    totalLotes:
      Number.isFinite(Number(processoJson.totalLotes ?? processoJson.total_lotes))
        ? Number(processoJson.totalLotes ?? processoJson.total_lotes)
        : lotes.length,
    totalItens: allItens.length,
    dadosOriginais: processoJson,
    
    // NEW FIELDS - Phase 1
    justificativa: normalizeTextPreserveLines(processoJson.justificativa),
    legislacaoAplicavel: normalizeText(processoJson.legislacao),
    observacoes: normalizeTextPreserveLines(processoJson.observacao),
    cotaME,
    
    // Hierarchical structure
    lotes,
    
    // Data quality metrics
    dataQuality: {
      completeness,
      missingCriticalFields: missingCritical,
      warnings,
    },
    
    // Backward compatibility
    itens: allItens,
  };
}

// ============================================================================
// DATA QUALITY AND VALIDATION
// ============================================================================

export interface ImportQualityReport {
  status: "OK" | "REVISAO_NECESARIA" | "REJEITADO";
  score: number; // 0-100
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export function validateImportQuality(
  processo: EnhancedNormalizedProcess,
): ImportQualityReport {
  const report: ImportQualityReport = {
    status: "OK",
    score: 100,
    errors: [],
    warnings: [],
    suggestions: [],
  };

  // CRITICAL VALIDATIONS (block import if failed)
  if (!processo.objeto?.trim()) {
    report.errors.push("Objeto do processo é obrigatório");
    report.score -= 40;
  }

  if (!processo.modalidade) {
    report.errors.push("Modalidade é obrigatória para classificação");
    report.score -= 30;
  }

  // IMPORTANT VALIDATIONS (warnings)
  if (
    !processo.justificativa &&
    ["INEXIGIBILIDADE", "DISPENSA"].includes(processo.modalidade)
  ) {
    report.warnings.push(
      "Processo de dispensa/inexigibilidade sem justificativa legal",
    );
    report.score -= 15;
  }

  if (
    processo.lotes.some(
      (l) => !l.valorReferencia && !l.valorHomologado,
    )
  ) {
    report.warnings.push(
      "Lotes sem valores financeiros dificultam análise de economicidade",
    );
    report.score -= 10;
  }

  // IMPROVEMENT SUGGESTIONS
  if (!processo.legislacaoAplicavel) {
    report.suggestions.push(
      "Recomenda-se informar a legislação aplicável (ex: Lei 14.133/2021)",
    );
  }

  if (processo.dataQuality.missingCriticalFields.length > 0) {
    report.suggestions.push(
      `Considere revisar campos ausentes: ${processo.dataQuality.missingCriticalFields.join(", ")}`,
    );
  }

  if (processo.lotes.length === 0) {
    report.suggestions.push(
      "Processo sem lotes estruturados - itens foram importados como lista plana",
    );
  }

  // Final status determination
  if (report.score < 50) {
    report.status = "REJEITADO";
  } else if (report.score < 80) {
    report.status = "REVISAO_NECESARIA";
  }

  return report;
}

function generateDataWarnings(
  processo: Record<string, unknown>,
  lotes: EnhancedNormalizedLote[],
): string[] {
  const warnings: string[] = [];

  if (!processo.objeto?.toString().trim()) {
    warnings.push("Objeto do processo está vazio ou ausente");
  }

  if (lotes.some((l) => !l.itens.length)) {
    warnings.push("Um ou mais lotes não possuem itens detalhados");
  }

  if (lotes.some((l) => !l.valorReferencia && !l.valorHomologado)) {
    warnings.push("Lotes sem valores de referência ou homologados");
  }

  if (!processo.justificativa && ["INEXIGIBILIDADE", "DISPENSA"].includes(
    String(processo.modalidade || "").trim(),
  )) {
    warnings.push("Dispensa/inexigibilidade sem justificativa legal");
  }

  return warnings;
}

// ============================================================================
// DATASET NORMALIZATION (Batch Processing)
// ============================================================================

export interface EnhancedNormalizedDataset {
  origem: "LICITACAO" | "COMPRA_DIRETA";
  atualizadoFonteEm: Date | null;
  detalhes: Record<string, unknown>;
  registros: EnhancedNormalizedProcess[];
  qualityReport: {
    totalProcessos: number;
    processosOk: number;
    processosParaRevisao: number;
    processosRejeitados: number;
    scoreMedia: number;
  };
}

export function normalizeEnhancedDataset(
  payload: Record<string, unknown>,
  origem: "LICITACAO" | "COMPRA_DIRETA",
): EnhancedNormalizedDataset {
  // Handle both "processos" and "registros" key names
  const processosRaw: unknown[] = Array.isArray(payload.processos || payload.registros)
    ? (payload.processos || payload.registros) as unknown[]
    : [];

  const normalized = (processosRaw as Record<string, unknown>[]).map((p: Record<string, unknown>) =>
    normalizeEnhancedProcess(p, origem),
  );

  // Validate and generate quality report
  const qualityReports = normalized.map((r: EnhancedNormalizedProcess) => validateImportQuality(r));
  const scores = qualityReports.map((r: ImportQualityReport) => r.score);

  return {
    origem,
    atualizadoFonteEm: parseBrazilianDateTime(
      payload.data_atualizacao ??
        (payload as Record<string, any>)?.metadata?.atualizado_em ??
        (payload as Record<string, any>)?.atualizado_em,
    ),
    detalhes: (payload.detalhes || {}) as Record<string, unknown>,
    registros: normalized,
    qualityReport: {
      totalProcessos: normalized.length,
      processosOk: qualityReports.filter((r: ImportQualityReport) => r.status === "OK").length,
      processosParaRevisao: qualityReports.filter(
        (r: ImportQualityReport) => r.status === "REVISAO_NECESARIA",
      ).length,
      processosRejeitados: qualityReports.filter(
        (r: ImportQualityReport) => r.status === "REJEITADO",
      ).length,
      scoreMedia: scores.length > 0
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : 0,
    },
  };
}




