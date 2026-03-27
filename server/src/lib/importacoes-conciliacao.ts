import { and, desc, eq, ilike, inArray, isNull, ne, or, SQL } from "drizzle-orm";

import type { ImportacaoBllSource } from "@sirel/shared/schemas/importacoes";

import { requireDb } from "../db/client.js";
import {
  catalogoItens,
  cotacoes,
  fornecedores,
  importacaoBllItens,
  importacaoBllLotes,
  importacaoBllProcessos,
  itensProcesso,
  lotes,
  modalidades,
  pessoas,
  prazosProcessuais,
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

  // Tentar ajustar campos do processo interno com base nos dados importados, sem sobrepor valores definidos manualmente.
  const updateData: any = {};

  if (record.numeroAdministrativo && !process.numeroAdministrativo) {
    updateData.numeroAdministrativo = record.numeroAdministrativo;
  }
  if (record.numeroEdital && !process.numeroEdital) {
    updateData.numeroEdital = record.numeroEdital;
  }

  const suggestedDataAbertura =
    record.publicacaoEm ?? record.inicioRecepcaoEm ?? record.inicioDisputaEm;
  if (suggestedDataAbertura && !process.dataAbertura) {
    updateData.dataAbertura = suggestedDataAbertura;
  }
  if (record.publicacaoEm && !process.dataPublicacao) {
    updateData.dataPublicacao = record.publicacaoEm;
  }
  if (record.inicioDisputaEm && !process.dataDisputaSessao) {
    updateData.dataDisputaSessao = record.inicioDisputaEm;
  }

  if (record.objeto && !process.objeto) {
    updateData.objeto = record.objeto;
  }

  if (record.valorTotal && !process.valorEstimado) {
    updateData.valorEstimado = Number(record.valorTotal);
  } else if (record.valorReferencia && !process.valorEstimado) {
    updateData.valorEstimado = Number(record.valorReferencia);
  }

  if (record.modalidade) {
    const modalidadeId = await findModalidadeIdByName(record.modalidade);
    if (modalidadeId && !process.modalidadeId) {
      updateData.modalidadeId = modalidadeId;
    }
  }

  if (record.tipoContrato && !process.tipoContratacao) {
    updateData.tipoContratacao = mapTipoContrato(record.tipoContrato);
  }

  let registroModoDisputa = null;
  if (record.dadosOriginais && typeof record.dadosOriginais === "object") {
    const raw = (record.dadosOriginais as Record<string, unknown>).modo_disputa ??
      (record.dadosOriginais as Record<string, unknown>).modoDisputa ??
      null;
    registroModoDisputa = typeof raw === "string" ? raw : null;
  }
  if (registroModoDisputa) {
    const modoDisputa = mapModoDisputa(registroModoDisputa);
    if (modoDisputa && !process.modoDisputa) {
      updateData.modoDisputa = modoDisputa;
    }
  }

  if (record.condutorNome && !process.condutorProcessoId) {
    const pessoaId = await findOrCreatePessoaByName(record.condutorNome);
    if (pessoaId) {
      updateData.condutorProcessoId = pessoaId;
    }
  }

  if (record.autoridadeNome && !process.autoridadeCompetenteId) {
    const pessoaId = await findOrCreatePessoaByName(record.autoridadeNome);
    if (pessoaId) {
      updateData.autoridadeCompetenteId = pessoaId;
    }
  }

  if (Object.keys(updateData).length) {
    await db.update(processos).set({ ...updateData, atualizadoEm: new Date() }).where(eq(processos.id, processoId));
  }

  const openingDate =
    parseFlexibleDate(record.inicioDisputaEm) ??
    parseFlexibleDate(updateData.dataDisputaSessao ?? process.dataDisputaSessao) ??
    parseFlexibleDate(record.inicioRecepcaoEm) ??
    parseFlexibleDate(updateData.dataAbertura ?? process.dataAbertura) ??
    parseFlexibleDate(record.publicacaoEm);

  await ensureFutureOpeningAgendaEntry({
    processoId,
    numeroSirel: process.numeroSirel,
    userId,
    openingDate,
  });

  // Link items and suppliers from the imported process
  await linkImportedItemsAndSuppliers(importedId, processoId, userId);
}

async function findOrCreateCatalogItem(
  description: string,
  unit: string | null,
  similarityThreshold: number = 0.85,
): Promise<number> {
  const db = requireDb();

  // Try to find an existing item with similar description
  const existingItems = await db
    .select({ id: catalogoItens.id, descricao: catalogoItens.descricao })
    .from(catalogoItens)
    .where(eq(catalogoItens.ativo, true))
    .limit(20);

  for (const item of existingItems) {
    if (tokenSimilarity(description, item.descricao) >= similarityThreshold) {
      return item.id;
    }
  }

  // Create a new catalog item if no similar one found
  const [newItem] = await db
    .insert(catalogoItens)
    .values({
      descricao: description,
      unidadePadrao: unit || "UN",
      ativo: true,
    })
    .returning({ id: catalogoItens.id });

  if (!newItem) {
    throw new Error("Falha ao criar item no catálogo.");
  }

  return newItem.id;
}

async function findOrCreateSupplier(
  supplierName: string,
  cnpj?: string | null,
): Promise<number> {
  const db = requireDb();

  // If CNPJ is provided, try to find by CNPJ first (unique constraint)
  if (cnpj?.trim()) {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length > 0) {
      const [existing] = await db
        .select({ id: fornecedores.id })
        .from(fornecedores)
        .where(eq(fornecedores.cnpj, cleanCnpj))
        .limit(1);

      if (existing) {
        return existing.id;
      }
    }
  }

  // Try to find by name similarity
  const existingSuppliers = await db
    .select({ id: fornecedores.id, razaoSocial: fornecedores.razaoSocial })
    .from(fornecedores)
    .where(eq(fornecedores.ativo, true))
    .limit(10);

  for (const supplier of existingSuppliers) {
    if (
      tokenSimilarity(supplierName, supplier.razaoSocial) >= 0.9 ||
      normalizeText(supplierName) === normalizeText(supplier.razaoSocial)
    ) {
      return supplier.id;
    }
  }

  // Create a new supplier if no existing one found
  const [newSupplier] = await db
    .insert(fornecedores)
    .values({
      razaoSocial: supplierName,
      cnpj: cnpj?.replace(/\D/g, "") || `AUTO_${Date.now()}`,
      ativo: true,
    })
    .returning({ id: fornecedores.id });

  if (!newSupplier) {
    throw new Error("Falha ao criar fornecedor.");
  }

  return newSupplier.id;
}

async function findOrCreatePessoaByName(name: string): Promise<number | null> {
  const db = requireDb();
  const normalized = normalizeText(name);
  if (!normalized) return null;

  const existing = await db
    .select({ id: pessoas.id, nome: pessoas.nome })
    .from(pessoas)
    .where(ilike(pessoas.nome, `%${normalized}%`))
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const [created] = await db
    .insert(pessoas)
    .values({ nome: name.trim(), ativo: true })
    .returning({ id: pessoas.id });

  return created?.id ?? null;
}

async function findModalidadeIdByName(name: string): Promise<number | null> {
  const db = requireDb();
  const normalized = normalizeText(name);
  if (!normalized) return null;

  const [existing] = await db
    .select({ id: modalidades.id, nome: modalidades.nome })
    .from(modalidades)
    .where(ilike(modalidades.nome, `%${normalized}%`))
    .limit(1);

  return existing?.id ?? null;
}

function mapTipoContrato(value: string | null | undefined): "AQUISICAO" | "REGISTRO_PRECO" | "AQUISICAO_PARCELADA" {
  const normalized = normalizeText(value);
  if (normalized.includes("registro")) return "REGISTRO_PRECO";
  if (normalized.includes("parcel")) return "AQUISICAO_PARCELADA";
  return "AQUISICAO";
}

function mapModoDisputa(value: string | null | undefined): "NAO_SE_APLICA" | "ABERTO" | "FECHADO" | "ABERTO_FECHADO" {
  const normalized = normalizeText(value);
  if (normalized.includes("aberto") && normalized.includes("fechado")) return "ABERTO_FECHADO";
  if (normalized.includes("aberto")) return "ABERTO";
  if (normalized.includes("fechado")) return "FECHADO";
  return "NAO_SE_APLICA";
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseFlexibleDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsedDateOnly = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsedDateOnly.getTime()) ? null : parsedDateOnly;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function ensureFutureOpeningAgendaEntry(params: {
  processoId: number;
  numeroSirel: string;
  userId: number | null;
  openingDate: Date | null;
}) {
  if (!params.openingDate) return;

  const openingDay = startOfDay(params.openingDate);
  const db = requireDb();
  const [existing] = await db
    .select({
      id: prazosProcessuais.id,
      dataPrevista: prazosProcessuais.dataPrevista,
    })
    .from(prazosProcessuais)
    .where(
      and(
        eq(prazosProcessuais.processoId, params.processoId),
        eq(prazosProcessuais.tipo, "SESSAO_PUBLICA"),
        ne(prazosProcessuais.status, "CONCLUIDO"),
      ),
    )
    .limit(1);

  const nextDate = toDateOnly(openingDay);
  if (existing) {
    if (existing.dataPrevista !== nextDate) {
      const now = new Date();
      const status = openingDay < startOfDay() ? "EM_ATRASO" : "PENDENTE";
      await db
        .update(prazosProcessuais)
        .set({
          dataPrevista: nextDate,
          status,
          observacao:
            "Prazo reagendado automaticamente por atualização da data de abertura na importação.",
          atualizadoEm: now,
        })
        .where(eq(prazosProcessuais.id, existing.id));
    }
    return;
  }

  if (openingDay <= startOfDay()) return;

  const now = new Date();
  await db.insert(prazosProcessuais).values({
    processoId: params.processoId,
    tipo: "SESSAO_PUBLICA",
    titulo: `Sessão pública • ${params.numeroSirel}`,
    dataPrevista: nextDate,
    status: "PENDENTE",
    responsavelId: params.userId ?? null,
    observacao:
      "Prazo criado automaticamente durante o vínculo da importação por conter data futura de abertura/disputa.",
    alertasConfig: { lembretes: [7, 3, 1], canais: ["sistema"] },
    criadoPor: params.userId ?? null,
    criadoEm: now,
    atualizadoEm: now,
  });
}

async function linkImportedItemsAndSuppliers(
  importedId: number,
  processoId: number,
  userId: number | null,
): Promise<void> {
  try {
    const db = requireDb();

    // Get all imported items for this process
    const importedItems = await db
      .select()
      .from(importacaoBllItens)
      .where(eq(importacaoBllItens.processoImportadoId, importedId));

    if (!importedItems.length) {
      return; // No items to process
    }

    // Track created items
    const processItems: {
      loteNumero: string | null;
      numeroItem: number;
      descricao: string;
      quantidade: number;
      unidade: string;
      valorUnitarioEstimado: number | null;
      valorTotalEstimado: number | null;
      catalogoItemId: number;
    }[] = [];

    // Process each imported item
    for (let index = 0; index < importedItems.length; index++) {
      const importedItem = importedItems[index];

      // Find or create catalog item
      const catalogoItemId = await findOrCreateCatalogItem(
        importedItem.descricao,
        importedItem.unidade,
      );

      // Parse quantities and values
      const quantidade = importedItem.quantidade
        ? Number(importedItem.quantidade)
        : 1;
      const valorUnitario = importedItem.valorUnitario
        ? Number(importedItem.valorUnitario)
        : null;
      const subtotal = importedItem.subtotal
        ? Number(importedItem.subtotal)
        : valorUnitario && quantidade
          ? valorUnitario * quantidade
          : null;

      processItems.push({
        loteNumero: importedItem.loteNumero,
        numeroItem: index + 1,
        descricao: importedItem.descricao,
        quantidade,
        unidade: importedItem.unidade || "UN",
        valorUnitarioEstimado: valorUnitario,
        valorTotalEstimado: subtotal,
        catalogoItemId,
      });
    }

    // Check if items already exist for this process
    const existingItems = await db
      .select({ id: itensProcesso.id })
      .from(itensProcesso)
      .where(eq(itensProcesso.processoId, processoId));

    // Create a map to track created items for supplier linking
    const itemCreationMap: {
      importedItemIndex: number;
      itemId: number;
      fornecedor: string | null;
      valorUnitario: number | null;
    }[] = [];

    // Only create items if the process doesn't have any yet
    if (!existingItems.length) {
      // Create items in the process - insert all at once and capture IDs
      const createdItems = await db
        .insert(itensProcesso)
        .values(
          processItems.map((item) => ({
            processoId,
            numeroItem: item.numeroItem,
            descricao: item.descricao,
            quantidade: String(item.quantidade),
            unidade: item.unidade,
            valorUnitarioEstimado: item.valorUnitarioEstimado
              ? String(item.valorUnitarioEstimado)
              : null,
            valorTotalEstimado: item.valorTotalEstimado
              ? String(item.valorTotalEstimado)
              : null,
            catalogoItemId: item.catalogoItemId,
          }))
        )
        .returning({ id: itensProcesso.id });

      // Map created items with imported items data and supplier info
      for (let i = 0; i < createdItems.length; i++) {
        itemCreationMap.push({
          importedItemIndex: i,
          itemId: createdItems[i].id,
          fornecedor: importedItems[i].fornecedorNome || null,
          valorUnitario: importedItems[i].valorUnitario
            ? Number(importedItems[i].valorUnitario)
            : null,
        });
      }
    } else {
      // If items already exist, map them with imported items for supplier linking
      for (let i = 0; i < importedItems.length; i++) {
        if (i < existingItems.length) {
          itemCreationMap.push({
            importedItemIndex: i,
            itemId: existingItems[i].id,
            fornecedor: importedItems[i].fornecedorNome || null,
            valorUnitario: importedItems[i].valorUnitario
              ? Number(importedItems[i].valorUnitario)
              : null,
          });
        }
      }
    }

    // Handle suppliers and homologated values
    const uniqueSuppliers = new Map<string, string>();
    for (const item of importedItems) {
      if (item.fornecedorNome?.trim()) {
        uniqueSuppliers.set(
          normalizeText(item.fornecedorNome),
          item.fornecedorNome,
        );
      }
    }

    // Create suppliers if they don't exist
    const supplierMap = new Map<string, number>();
    for (const [, supplierName] of uniqueSuppliers) {
      try {
        const supplierId = await findOrCreateSupplier(supplierName);
        supplierMap.set(supplierName, supplierId);
      } catch (error) {
        // Log supplier creation error but continue
        console.error(
          `Erro ao criar/vincular fornecedor "${supplierName}":`,
          error
        );
      }
    }

    // Link suppliers to items via cotacoes (quotations) table
    for (const itemData of itemCreationMap) {
      if (itemData.fornecedor && supplierMap.has(itemData.fornecedor)) {
        try {
          const supplierId = supplierMap.get(itemData.fornecedor)!;

          // Check if cotacao already exists
          const existingCotacao = await db
            .select({ id: cotacoes.id })
            .from(cotacoes)
            .where(
              and(
                eq(cotacoes.itemId, itemData.itemId),
                eq(cotacoes.fornecedorId, supplierId)
              )
            )
            .limit(1);

          if (!existingCotacao.length) {
            // Create cotacao linking supplier to item
            await db.insert(cotacoes).values({
              processoId,
              itemId: itemData.itemId,
              fornecedorId: supplierId,
              valorUnitario: itemData.valorUnitario
                ? String(itemData.valorUnitario)
                : null,
              valorTotal: null,
              status: "ATIVA",
            });
          }
        } catch (error) {
          // Log cotacao creation error but continue
          console.error(
            `Erro ao criar cotação para item ${itemData.itemId} e fornecedor ${itemData.fornecedor}:`,
            error
          );
        }
      }
    }

    // Calculate total value from imported items for homologated value
    let totalValue = 0;
    for (const item of importedItems) {
      if (item.subtotal) {
        totalValue += Number(item.subtotal);
      } else if (item.valorUnitario && item.quantidade) {
        totalValue += Number(item.valorUnitario) * Number(item.quantidade);
      }
    }

    // Create or update lotes with homologated value
    const lotes_batch = await db
      .select({ id: lotes.id, numeroLote: lotes.numeroLote })
      .from(lotes)
      .where(eq(lotes.processoId, processoId));

    if (lotes_batch.length === 0 && totalValue > 0) {
      // Create a default batch if none exists and we have a total value
      await db.insert(lotes).values({
        processoId,
        numeroLote: 1,
        descricao: `Lote importado de ${importedItems.length} item(ns)`,
        valorEstimado: String(totalValue),
        valorHomologado: String(totalValue),
      });
    } else if (lotes_batch.length > 0 && totalValue > 0) {
      // Update the first batch with the homologated value
      await db
        .update(lotes)
        .set({ valorHomologado: String(totalValue) })
        .where(eq(lotes.id, lotes_batch[0].id));
    }
  } catch (error) {
    // Log errors but don't throw - the main process link should succeed even if items fail
    console.error(
      "Erro ao vincular itens e fornecedores importados:",
      error
    );
  }
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

export async function deleteImportedProcess(importedId: number) {
  const db = requireDb();
  // Itens e lotes possuem onDelete cascade, mas deletamos explicitamente por clareza
  await db
    .delete(importacaoBllItens)
    .where(eq(importacaoBllItens.processoImportadoId, importedId));

  await db
    .delete(importacaoBllLotes)
    .where(eq(importacaoBllLotes.processoImportadoId, importedId));

  await db
    .delete(importacaoBllProcessos)
    .where(eq(importacaoBllProcessos.id, importedId));
}

export async function deleteImportedProcesses(importedIds: number[]) {
  if (!importedIds.length) return;
  const db = requireDb();

  await db
    .delete(importacaoBllItens)
    .where(inArray(importacaoBllItens.processoImportadoId, importedIds));

  await db
    .delete(importacaoBllLotes)
    .where(inArray(importacaoBllLotes.processoImportadoId, importedIds));

  await db
    .delete(importacaoBllProcessos)
    .where(inArray(importacaoBllProcessos.id, importedIds));
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
