import { and, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";

import type { ImportacaoBllSource } from "@sirel/shared/schemas/importacoes";

import { requireDb } from "../db/client.js";
import {
  importacaoBllProcessos,
  modalidades,
  processos,
  secretarias,
  statusProcesso,
  workflowProcesso,
} from "../db/schema.js";

type ConciliacaoStatus = "PENDENTE" | "SUGERIDO" | "VINCULADO" | "IGNORADO";

interface ProcessoInternoBase {
  id: number;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  anoReferencia: number;
  objeto: string;
  valorEstimado: number | null;
  dataAbertura: string | Date | null;
  secretariaNome: string;
  modalidadeNome: string | null;
  statusNome: string | null;
  moduloAtual: string | null;
}

interface RegistroImportadoBase {
  id: number;
  origem: ImportacaoBllSource;
  chaveExterna: string;
  numeroEdital: string | null;
  numeroAdministrativo: string | null;
  anoReferencia: number | null;
  modalidade: string;
  objeto: string;
  valorReferencia: string | null;
  valorTotal: string | null;
  publicacaoEm: Date | null;
  processoInternoId: number | null;
  statusConciliacao: ConciliacaoStatus;
}

export interface SugestaoConciliacao {
  processoId: number;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  objeto: string;
  modalidade: string | null;
  secretaria: string;
  moduloAtual: string | null;
  valorEstimado: number | null;
  score: number;
  nivel: "ALTO" | "MEDIO" | "BAIXO";
  motivos: string[];
}

function normalizeIdentifier(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .trim();
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(value: unknown) {
  const stopwords = new Set([
    "a",
    "as",
    "o",
    "os",
    "ao",
    "aos",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "para",
    "por",
    "com",
    "sem",
    "uma",
    "um",
  ]);

  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function tokenSimilarity(left: unknown, right: unknown) {
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

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractReferenceValue(record: RegistroImportadoBase) {
  return numberOrNull(record.valorTotal ?? record.valorReferencia);
}

function dateDistanceInDays(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
) {
  if (!left || !right) return null;
  const leftDate = left instanceof Date ? left : new Date(left);
  const rightDate = right instanceof Date ? right : new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime()))
    return null;
  return (
    Math.abs(leftDate.getTime() - rightDate.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function buildSuggestion(
  record: RegistroImportadoBase,
  process: ProcessoInternoBase,
): SugestaoConciliacao | null {
  let score = 0;
  const motivos: string[] = [];

  const importedEdital = normalizeIdentifier(record.numeroEdital);
  const internalEdital = normalizeIdentifier(process.numeroEdital);
  if (importedEdital && internalEdital && importedEdital === internalEdital) {
    score += 72;
    motivos.push("Número de edital coincidente.");
  }

  const importedNumeroAdm = normalizeIdentifier(record.numeroAdministrativo);
  const internalNumeroAdm = normalizeIdentifier(process.numeroAdministrativo);
  if (
    importedNumeroAdm &&
    internalNumeroAdm &&
    importedNumeroAdm === internalNumeroAdm
  ) {
    score += 68;
    motivos.push("Número administrativo coincidente.");
  }

  const modalidadeSimilar =
    normalizeText(record.modalidade) &&
    normalizeText(process.modalidadeNome) &&
    (normalizeText(record.modalidade).includes(
      normalizeText(process.modalidadeNome),
    ) ||
      normalizeText(process.modalidadeNome).includes(
        normalizeText(record.modalidade),
      ));
  if (modalidadeSimilar) {
    score += 10;
    motivos.push("Modalidade compatível.");
  }

  if (
    record.anoReferencia &&
    process.anoReferencia &&
    record.anoReferencia === process.anoReferencia
  ) {
    score += 5;
    motivos.push("Ano de referência compatível.");
  }

  const similaridadeObjeto = tokenSimilarity(record.objeto, process.objeto);
  if (similaridadeObjeto >= 0.82) {
    score += 28;
    motivos.push("Objeto muito semelhante.");
  } else if (similaridadeObjeto >= 0.65) {
    score += 22;
    motivos.push("Objeto com alta proximidade textual.");
  } else if (similaridadeObjeto >= 0.45) {
    score += 12;
    motivos.push("Objeto com proximidade relevante.");
  }

  const importedValue = extractReferenceValue(record);
  if (
    importedValue !== null &&
    process.valorEstimado !== null &&
    process.valorEstimado > 0
  ) {
    const delta =
      Math.abs(importedValue - process.valorEstimado) / process.valorEstimado;
    if (delta <= 0.02) {
      score += 10;
      motivos.push("Valor estimado praticamente idêntico.");
    } else if (delta <= 0.1) {
      score += 6;
      motivos.push("Valor estimado muito próximo.");
    }
  }

  const dateDistance = dateDistanceInDays(
    record.publicacaoEm,
    process.dataAbertura,
  );
  if (dateDistance !== null && dateDistance <= 45) {
    score += 5;
    motivos.push("Datas públicas próximas.");
  }

  if (score < 20) {
    return null;
  }

  return {
    processoId: process.id,
    numeroSirel: process.numeroSirel,
    numeroAdministrativo: process.numeroAdministrativo,
    numeroEdital: process.numeroEdital,
    objeto: process.objeto,
    modalidade: process.modalidadeNome,
    secretaria: process.secretariaNome,
    moduloAtual: process.moduloAtual,
    valorEstimado: process.valorEstimado,
    score,
    nivel: score >= 85 ? "ALTO" : score >= 60 ? "MEDIO" : "BAIXO",
    motivos,
  };
}

async function loadInternalProcesses(search?: string) {
  const db = requireDb();
  const filters = search?.trim()
    ? [
        eq(processos.ativo, true),
        or(
          ilike(processos.numeroSirel, `%${search}%`),
          ilike(processos.numeroAdministrativo, `%${search}%`),
          ilike(processos.numeroEdital, `%${search}%`),
          ilike(processos.objeto, `%${search}%`),
        ),
      ]
    : [eq(processos.ativo, true)];

  const rows = await db
    .select({
      id: processos.id,
      numeroSirel: processos.numeroSirel,
      numeroAdministrativo: processos.numeroAdministrativo,
      numeroEdital: processos.numeroEdital,
      anoReferencia: processos.anoReferencia,
      objeto: processos.objeto,
      valorEstimado: processos.valorEstimado,
      dataAbertura: processos.dataAbertura,
      secretariaNome: secretarias.nome,
      modalidadeNome: modalidades.nome,
      statusNome: statusProcesso.nome,
      moduloAtual: workflowProcesso.moduloAtual,
    })
    .from(processos)
    .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
    .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
    .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
    .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(processos.criadoEm), desc(processos.id));

  return rows.map((row) => ({
    ...row,
    valorEstimado: row.valorEstimado ? numberOrNull(row.valorEstimado) : null,
  })) as ProcessoInternoBase[];
}

export async function loadImportedProcessRecord(importedId: number) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(importacaoBllProcessos)
    .where(eq(importacaoBllProcessos.id, importedId))
    .limit(1);

  return row as RegistroImportadoBase | undefined;
}

export async function getConciliationSuggestions(
  importedId: number,
  options?: { search?: string; limit?: number },
) {
  const record = await loadImportedProcessRecord(importedId);
  if (!record) {
    return [];
  }

  const processesBase = await loadInternalProcesses(options?.search);
  const suggestions = processesBase
    .map((process) => buildSuggestion(record, process))
    .filter((item): item is SugestaoConciliacao => Boolean(item))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.numeroSirel.localeCompare(right.numeroSirel),
    )
    .slice(0, options?.limit ?? 8);

  return suggestions;
}

function buildConciliationPayload(suggestions: SugestaoConciliacao[]) {
  const best = suggestions[0] ?? null;
  return {
    melhorSugestao: best
      ? {
          processoId: best.processoId,
          numeroSirel: best.numeroSirel,
          score: best.score,
          nivel: best.nivel,
          motivos: best.motivos,
        }
      : null,
    sugestoes: suggestions.slice(0, 5).map((item) => ({
      processoId: item.processoId,
      numeroSirel: item.numeroSirel,
      score: item.score,
      nivel: item.nivel,
      motivos: item.motivos,
    })),
  };
}

export async function refreshConciliationForImportedIds(importedIds: number[]) {
  if (!importedIds.length) {
    return { atualizados: 0, sugeridos: 0, pendentes: 0 };
  }

  const db = requireDb();
  const records = await db
    .select()
    .from(importacaoBllProcessos)
    .where(inArray(importacaoBllProcessos.id, importedIds));

  let sugeridos = 0;
  let pendentes = 0;

  for (const record of records) {
    if (record.processoInternoId || record.statusConciliacao === "IGNORADO") {
      continue;
    }

    const suggestions = await getConciliationSuggestions(record.id, {
      limit: 5,
    });
    const top = suggestions[0] ?? null;
    const status: ConciliacaoStatus = top ? "SUGERIDO" : "PENDENTE";
    if (status === "SUGERIDO") {
      sugeridos += 1;
    } else {
      pendentes += 1;
    }

    await db
      .update(importacaoBllProcessos)
      .set({
        statusConciliacao: status,
        scoreConciliacao: top?.score ?? null,
        detalhesConciliacao: buildConciliationPayload(suggestions),
      })
      .where(eq(importacaoBllProcessos.id, record.id));
  }

  return {
    atualizados: records.length,
    sugeridos,
    pendentes,
  };
}

export async function refreshConciliationForSource(
  source?: ImportacaoBllSource,
) {
  const db = requireDb();
  const rows = await db
    .select({ id: importacaoBllProcessos.id })
    .from(importacaoBllProcessos)
    .where(source ? eq(importacaoBllProcessos.origem, source) : undefined);

  return refreshConciliationForImportedIds(rows.map((row) => row.id));
}

export async function linkImportedProcessToInternal(
  importedId: number,
  processoId: number,
  userId: number | null,
  mode: "MANUAL" | "AUTOMATICA" = "MANUAL",
) {
  const db = requireDb();
  const [record] = await db
    .select()
    .from(importacaoBllProcessos)
    .where(eq(importacaoBllProcessos.id, importedId))
    .limit(1);

  if (!record) {
    throw new Error("Registro importado não encontrado.");
  }

  const [process] = await db
    .select()
    .from(processos)
    .where(eq(processos.id, processoId))
    .limit(1);

  if (!process) {
    throw new Error("Processo interno não encontrado.");
  }

  const [alreadyLinked] = await db
    .select({
      id: importacaoBllProcessos.id,
      origem: importacaoBllProcessos.origem,
      chaveExterna: importacaoBllProcessos.chaveExterna,
    })
    .from(importacaoBllProcessos)
    .where(
      and(
        eq(importacaoBllProcessos.processoInternoId, processoId),
        ne(importacaoBllProcessos.id, importedId),
      ),
    )
    .limit(1);

  if (alreadyLinked) {
    throw new Error(
      `O processo interno já está vinculado ao registro importado ${alreadyLinked.origem} / ${alreadyLinked.chaveExterna}.`,
    );
  }

  const suggestions = await getConciliationSuggestions(importedId, {
    limit: 5,
  });
  const matchedSuggestion =
    suggestions.find((item) => item.processoId === processoId) ?? null;

  await db
    .update(importacaoBllProcessos)
    .set({
      processoInternoId: processoId,
      statusConciliacao: "VINCULADO",
      scoreConciliacao: matchedSuggestion?.score ?? null,
      detalhesConciliacao: {
        metodo: mode,
        vinculadoEm: new Date().toISOString(),
        processoInternoId: processoId,
        sugestaoUtilizada: matchedSuggestion,
        sugestoes: suggestions.slice(0, 5),
      },
      conciliadoPor: userId,
      conciliadoEm: new Date(),
    })
    .where(eq(importacaoBllProcessos.id, importedId));
}

export async function unlinkImportedProcess(importedId: number) {
  const db = requireDb();
  await db
    .update(importacaoBllProcessos)
    .set({
      processoInternoId: null,
      statusConciliacao: "PENDENTE",
      scoreConciliacao: null,
      detalhesConciliacao: null,
      conciliadoPor: null,
      conciliadoEm: null,
    })
    .where(eq(importacaoBllProcessos.id, importedId));

  await refreshConciliationForImportedIds([importedId]);
}

export async function setImportedProcessIgnored(
  importedId: number,
  ignored: boolean,
  userId: number | null,
) {
  const db = requireDb();
  await db
    .update(importacaoBllProcessos)
    .set({
      processoInternoId: null,
      statusConciliacao: ignored ? "IGNORADO" : "PENDENTE",
      scoreConciliacao: null,
      detalhesConciliacao: ignored
        ? { metodo: "MANUAL", ignoradoEm: new Date().toISOString() }
        : null,
      conciliadoPor: ignored ? userId : null,
      conciliadoEm: ignored ? new Date() : null,
    })
    .where(eq(importacaoBllProcessos.id, importedId));

  if (!ignored) {
    await refreshConciliationForImportedIds([importedId]);
  }
}

export async function autoReconcileImportedProcesses(params: {
  source?: ImportacaoBllSource;
  onlyPending?: boolean;
  userId: number | null;
}) {
  const db = requireDb();
  const filters = [isNull(importacaoBllProcessos.processoInternoId)];
  if (params.source) {
    filters.push(eq(importacaoBllProcessos.origem, params.source));
  }
  if (params.onlyPending ?? true) {
    filters.push(
      inArray(importacaoBllProcessos.statusConciliacao, [
        "PENDENTE",
        "SUGERIDO",
      ]),
    );
  }

  const records = await db
    .select()
    .from(importacaoBllProcessos)
    .where(and(...filters))
    .orderBy(
      desc(importacaoBllProcessos.publicacaoEm),
      desc(importacaoBllProcessos.id),
    );

  let vinculados = 0;
  let sugeridos = 0;
  let pendentes = 0;

  for (const record of records) {
    const suggestions = await getConciliationSuggestions(record.id, {
      limit: 5,
    });
    const top = suggestions[0] ?? null;
    const second = suggestions[1] ?? null;
    const canAutoLink =
      top && top.score >= 85 && (!second || top.score - second.score >= 10);

    if (canAutoLink) {
      try {
        await linkImportedProcessToInternal(
          record.id,
          top.processoId,
          params.userId,
          "AUTOMATICA",
        );
        vinculados += 1;
        continue;
      } catch {
        // Se o processo já estiver vinculado a outro registro, seguimos como sugestão para revisão manual.
      }
    }

    await db
      .update(importacaoBllProcessos)
      .set({
        statusConciliacao: top ? "SUGERIDO" : "PENDENTE",
        scoreConciliacao: top?.score ?? null,
        detalhesConciliacao: buildConciliationPayload(suggestions),
      })
      .where(eq(importacaoBllProcessos.id, record.id));

    if (top) {
      sugeridos += 1;
    } else {
      pendentes += 1;
    }
  }

  return {
    analisados: records.length,
    vinculados,
    sugeridos,
    pendentes,
  };
}

export async function getLinkedInternalProcess(importedId: number) {
  const db = requireDb();
  const [row] = await db
    .select({
      id: processos.id,
      numeroSirel: processos.numeroSirel,
      numeroAdministrativo: processos.numeroAdministrativo,
      numeroEdital: processos.numeroEdital,
      objeto: processos.objeto,
      secretariaNome: secretarias.nome,
      modalidadeNome: modalidades.nome,
      statusNome: statusProcesso.nome,
      moduloAtual: workflowProcesso.moduloAtual,
    })
    .from(importacaoBllProcessos)
    .innerJoin(
      processos,
      eq(processos.id, importacaoBllProcessos.processoInternoId),
    )
    .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
    .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
    .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
    .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
    .where(eq(importacaoBllProcessos.id, importedId))
    .limit(1);

  return row ?? null;
}

export async function getConciliationSummaryCounts() {
  const db = requireDb();
  const rows = await db
    .select({
      statusConciliacao: importacaoBllProcessos.statusConciliacao,
      total: importacaoBllProcessos.id,
    })
    .from(importacaoBllProcessos);

  const summary = {
    PENDENTE: 0,
    SUGERIDO: 0,
    VINCULADO: 0,
    IGNORADO: 0,
  } satisfies Record<ConciliacaoStatus, number>;

  for (const row of rows) {
    summary[row.statusConciliacao as ConciliacaoStatus] += 1;
  }

  return summary;
}
