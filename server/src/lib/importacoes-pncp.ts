import { and, desc, eq, ilike, inArray, isNull, ne, or, SQL } from "drizzle-orm";

import type { ImportacaoBllSource } from "@sirel/shared/schemas/importacoes";

import { requireDb } from "../db/client.js";
import { importacaoBllProcessos } from "../db/schema.js";

export interface PncpProcess {
  id: string;
  numeroControlePNCP: string;
  anoCompra: number;
  sequencialCompra: number;
  modalidadeId: number;
  modalidadeNome: string;
  dataPublicacaoPncp: string;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  dataPublicacaoHomologacao: string | null;
  objetoCompra: string;
  valorTotalEstimado: number;
  valorTotalHomologado: number | null;
  orgaoEntidadeNome: string;
  unidadeOrgaoNome: string;
  unidadeOrgaoCnpj: string;
  esferaId: number;
  esferaNome: string;
  poderId: number;
  poderNome: string;
  urlProcesso: string;
  situacaoCompraId: number;
  situacaoCompraNome: string;
  modoDisputaId: number | null;
  modoDisputaNome: string | null;
  tipoInstrumentoConvocatorioId: number;
  tipoInstrumentoConvocatorioNome: string;
  amparoLegalId: number;
  amparoLegalNome: string;
  linkSistemaOrigem: string | null;
  srp: boolean;
  dataInclusao: string;
  dataAtualizacao: string;
}

export interface PncpItem {
  numeroItem: number;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  valorUnitarioEstimado: number;
  valorTotalEstimado: number;
  valorUnitarioHomologado: number | null;
  valorTotalHomologado: number | null;
  cnpjFornecedor: string | null;
  nomeFornecedor: string | null;
  situacaoItemId: number;
  situacaoItemNome: string;
}

export interface PncpConciliacaoSuggestion {
  importacaoBllId: number;
  pncpProcess: PncpProcess;
  score: number;
  nivel: "ALTO" | "MEDIO" | "BAIXO";
  motivos: string[];
  similaridadeObjeto: number;
  similaridadeValor: number;
  similaridadeData: number;
  similaridadeModalidade: number;
}

const PNCP_API_BASE_URL = "https://pncp.gov.br/api";
const PNCP_SEARCH_ENDPOINT = "/compras/v1/compras";

/**
 * Busca processos PNCP por filtros
 */
export async function searchPncpProcesses(filters: {
  anoCompra?: number;
  modalidadeId?: number;
  orgaoCnpj?: string;
  dataInicial?: string;
  dataFinal?: string;
  pagina?: number;
  tamanhoPagina?: number;
}): Promise<{ data: PncpProcess[]; total: number; pagina: number; tamanhoPagina: number }> {
  const params = new URLSearchParams();

  if (filters.anoCompra) params.append("anoCompra", filters.anoCompra.toString());
  if (filters.modalidadeId) params.append("modalidadeId", filters.modalidadeId.toString());
  if (filters.orgaoCnpj) params.append("orgaoCnpj", filters.orgaoCnpj.toString());
  if (filters.dataInicial) params.append("dataInicial", filters.dataInicial);
  if (filters.dataFinal) params.append("dataFinal", filters.dataFinal);
  if (filters.pagina) params.append("pagina", filters.pagina.toString());
  if (filters.tamanhoPagina) params.append("tamanhoPagina", filters.tamanhoPagina.toString());

  const url = `${PNCP_API_BASE_URL}${PNCP_SEARCH_ENDPOINT}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "SIREL/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`PNCP API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      data: data.data || [],
      total: data.total || 0,
      pagina: data.pagina || 1,
      tamanhoPagina: data.tamanhoPagina || 10,
    };
  } catch (error) {
    console.error("Erro ao buscar processos PNCP:", error);
    throw error;
  }
}

/**
 * Busca detalhes de um processo PNCP específico
 */
export async function getPncpProcessDetails(
  anoCompra: number,
  sequencialCompra: number
): Promise<PncpProcess & { itens: PncpItem[] }> {
  const url = `${PNCP_API_BASE_URL}/compras/v1/compras/${anoCompra}/${sequencialCompra}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "SIREL/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`PNCP API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Erro ao buscar detalhes do processo PNCP:", error);
    throw error;
  }
}

/**
 * Normaliza texto para comparação
 */
function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokeniza texto removendo stopwords
 */
function tokenizeText(value: unknown): string[] {
  const stopwords = new Set([
    "a", "as", "o", "os", "ao", "aos", "da", "das", "de", "do", "dos",
    "e", "em", "na", "nas", "no", "nos", "para", "por", "com", "sem",
    "uma", "um", "de", "do", "da", "das", "dos", "a", "as", "o", "os",
    "ao", "aos", "na", "nas", "no", "nos", "para", "por", "com", "uma", "um"
  ]);

  return normalizeText(value)
    .split(" ")
    .filter(token => token.length > 2 && !stopwords.has(token));
}

/**
 * Calcula similaridade de Jaccard entre dois conjuntos de tokens
 */
function tokenSimilarity(left: unknown, right: unknown): number {
  const leftTokens = new Set(tokenizeText(left));
  const rightTokens = new Set(tokenizeText(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

/**
 * Calcula similaridade de valores numéricos
 */
function valueSimilarity(left: number | null, right: number | null, tolerance = 0.1): number {
  if (left === null || right === null || left === 0 || right === 0) {
    return 0;
  }

  const delta = Math.abs(left - right) / Math.max(left, right);
  return delta <= tolerance ? 1 - delta / tolerance : 0;
}

/**
 * Calcula similaridade de datas
 */
function dateSimilarity(left: string | Date | null, right: string | Date | null, maxDays = 30): number {
  if (!left || !right) return 0;

  const leftDate = left instanceof Date ? left : new Date(left);
  const rightDate = right instanceof Date ? right : new Date(right);

  if (isNaN(leftDate.getTime()) || isNaN(rightDate.getTime())) return 0;

  const diffDays = Math.abs(leftDate.getTime() - rightDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= maxDays ? 1 - diffDays / maxDays : 0;
}

/**
 * Calcula similaridade de modalidade
 */
function modalidadeSimilarity(bllModalidade: string, pncpModalidade: string): number {
  const bllNorm = normalizeText(bllModalidade);
  const pncpNorm = normalizeText(pncpModalidade);

  // Mapeamento de modalidades BLL para PNCP
  const modalidadeMap: Record<string, string[]> = {
    "pregao": ["pregao", "pregao presencial", "pregao eletronico"],
    "concorrencia": ["concorrencia", "concorrencia publica"],
    "concurso": ["concurso"],
    "leilao": ["leilao"],
    "dialogo": ["dialogo competitivo"],
    "concessao": ["concessao", "parceria"],
    "dispensa": ["dispensa", "inexigibilidade"],
    "inexigibilidade": ["inexigibilidade", "dispensa"],
  };

  for (const [bllKey, pncpKeys] of Object.entries(modalidadeMap)) {
    if (bllNorm.includes(bllKey)) {
      for (const pncpKey of pncpKeys) {
        if (pncpNorm.includes(pncpKey)) {
          return 1.0;
        }
      }
    }
  }

  // Similaridade textual como fallback
  return tokenSimilarity(bllModalidade, pncpModalidade);
}

/**
 * Gera sugestões de conciliação PNCP para um processo BLL importado
 */
export async function generatePncpConciliationSuggestions(
  importacaoBllId: number,
  maxSuggestions = 5
): Promise<PncpConciliacaoSuggestion[]> {
  const db = requireDb();

  // Busca dados do processo BLL
  const bllProcess = await db
    .select()
    .from(importacaoBllProcessos)
    .where(eq(importacaoBllProcessos.id, importacaoBllId))
    .limit(1);

  if (!bllProcess.length) {
    throw new Error(`Processo BLL não encontrado: ${importacaoBllId}`);
  }

  const bll = bllProcess[0];

  // Busca processos PNCP similares
  const pncpFilters = {
    anoCompra: bll.anoReferencia || undefined,
    dataInicial: bll.publicacaoEm ? new Date(bll.publicacaoEm.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined,
    dataFinal: bll.publicacaoEm ? new Date(bll.publicacaoEm.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined,
    pagina: 1,
    tamanhoPagina: 50,
  };

  const pncpResults = await searchPncpProcesses(pncpFilters);

  // Calcula similaridade para cada processo PNCP
  const suggestions: PncpConciliacaoSuggestion[] = [];

  for (const pncpProcess of pncpResults.data) {
    const similaridadeObjeto = tokenSimilarity(bll.objeto, pncpProcess.objetoCompra);
    const similaridadeValor = valueSimilarity(
      parseFloat(bll.valorTotal || bll.valorReferencia || "0"),
      pncpProcess.valorTotalEstimado
    );
    const similaridadeData = dateSimilarity(
      bll.publicacaoEm,
      pncpProcess.dataPublicacaoPncp
    );
    const similaridadeModalidade = modalidadeSimilarity(
      bll.modalidade,
      pncpProcess.modalidadeNome
    );

    // Calcula score total (pesos arbitrários)
    const score = (
      similaridadeObjeto * 40 +      // 40% - similaridade do objeto
      similaridadeValor * 25 +       // 25% - similaridade do valor
      similaridadeData * 20 +        // 20% - similaridade da data
      similaridadeModalidade * 15    // 15% - similaridade da modalidade
    );

    if (score >= 20) { // Threshold mínimo
      const motivos: string[] = [];

      if (similaridadeObjeto >= 0.8) motivos.push("Objeto muito semelhante");
      else if (similaridadeObjeto >= 0.6) motivos.push("Objeto com boa similaridade");

      if (similaridadeValor >= 0.9) motivos.push("Valor praticamente idêntico");
      else if (similaridadeValor >= 0.7) motivos.push("Valor muito próximo");

      if (similaridadeData >= 0.8) motivos.push("Datas muito próximas");
      else if (similaridadeData >= 0.6) motivos.push("Datas próximas");

      if (similaridadeModalidade >= 0.9) motivos.push("Modalidade compatível");

      suggestions.push({
        importacaoBllId,
        pncpProcess,
        score: Math.round(score),
        nivel: score >= 75 ? "ALTO" : score >= 50 ? "MEDIO" : "BAIXO",
        motivos,
        similaridadeObjeto,
        similaridadeValor,
        similaridadeData,
        similaridadeModalidade,
      });
    }
  }

  // Ordena por score decrescente e limita resultados
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);
}

/**
 * Executa conciliação automática PNCP para processos BLL não conciliados
 */
export async function executeAutomaticPncpConciliation(
  origem?: ImportacaoBllSource,
  minScore = 80
): Promise<{ processed: number; conciliations: number; errors: number }> {
  const db = requireDb();

  // Busca processos BLL não conciliados e sem código PNCP
  const whereConditions = [
    isNull(importacaoBllProcessos.codigoPncp),
    eq(importacaoBllProcessos.statusConciliacao, "PENDENTE" as const),
  ];

  if (origem) {
    whereConditions.push(eq(importacaoBllProcessos.origem, origem));
  }

  const bllProcesses = await db
    .select({
      id: importacaoBllProcessos.id,
      objeto: importacaoBllProcessos.objeto,
      modalidade: importacaoBllProcessos.modalidade,
      valorTotal: importacaoBllProcessos.valorTotal,
      valorReferencia: importacaoBllProcessos.valorReferencia,
      publicacaoEm: importacaoBllProcessos.publicacaoEm,
      anoReferencia: importacaoBllProcessos.anoReferencia,
    })
    .from(importacaoBllProcessos)
    .where(and(...whereConditions))
    .limit(100); // Processa em lotes

  let processed = 0;
  let conciliations = 0;
  let errors = 0;

  for (const bllProcess of bllProcesses) {
    try {
      const suggestions = await generatePncpConciliationSuggestions(bllProcess.id, 1);

      if (suggestions.length > 0 && suggestions[0].score >= minScore) {
        const bestMatch = suggestions[0];

        // Atualiza o processo BLL com dados PNCP
        await db
          .update(importacaoBllProcessos)
          .set({
            codigoPncp: bestMatch.pncpProcess.numeroControlePNCP,
            urlPncp: bestMatch.pncpProcess.urlProcesso,
            dataSincronizacaoPncp: new Date(),
            statusConciliacao: "VINCULADO" as const,
            scoreConciliacao: bestMatch.score,
            detalhesConciliacao: {
              tipo: "PNCP_AUTO",
              pncpProcess: bestMatch.pncpProcess,
              similaridades: {
                objeto: bestMatch.similaridadeObjeto,
                valor: bestMatch.similaridadeValor,
                data: bestMatch.similaridadeData,
                modalidade: bestMatch.similaridadeModalidade,
              },
              motivos: bestMatch.motivos,
            },
          })
          .where(eq(importacaoBllProcessos.id, bllProcess.id));

        conciliations++;
      }

      processed++;
    } catch (error) {
      console.error(`Erro ao processar conciliação PNCP para processo ${bllProcess.id}:`, error);
      errors++;
    }
  }

  return { processed, conciliations, errors };
}