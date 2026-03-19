
import { and, desc, eq, sql } from "drizzle-orm";

import type { ImportacaoBllSource } from "@sirel/shared/schemas/importacoes";

import { databaseEnabled, requireDb } from "../db/client.js";
import { importacaoBllExecucoes, importacaoBllItens, importacaoBllProcessos } from "../db/schema.js";
import { refreshConciliationForImportedIds } from "./importacoes-conciliacao.js";

const IMPORT_TIMEZONE = process.env.IMPORT_BLL_TIMEZONE?.trim() || "America/Sao_Paulo";
const IMPORT_DAILY_HOUR = Number.parseInt(process.env.IMPORT_BLL_DAILY_HOUR ?? "7", 10);
const IMPORT_AUTOMATIC_ENABLED = !["0", "false", "off", "nao", "não"].includes(
  String(process.env.IMPORT_BLL_AUTOMATICA ?? "true").trim().toLowerCase(),
);
const SCHEDULER_POLL_INTERVAL_MS = 10 * 60 * 1000;

export const remoteImportSources: Record<ImportacaoBllSource, { label: string; url: string }> = {
  LICITACAO: {
    label: "Licitações BLL",
    url: "https://sergiocarneiro-adm.github.io/licitacao/dados.json",
  },
  COMPRA_DIRETA: {
    label: "Compras diretas BLL",
    url: "https://sergiocarneiro-adm.github.io/licitacao/dados_compra_direta.json",
  },
};

type SyncMode = "REMOTA_JSON" | "CSV_MANUAL";
type ExecutionStatus = "PROCESSANDO" | "CONCLUIDA" | "ERRO";

interface NormalizedImportItem {
  loteNumero: string | null;
  itemNumero: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: string | null;
  fornecedorNome: string | null;
  marca: string | null;
  modelo: string | null;
  valorReferencia: string | null;
  valorUnitario: string | null;
  subtotal: string | null;
  situacaoExterna: string | null;
  faseExterna: string | null;
  dadosOriginais: Record<string, unknown>;
}

interface NormalizedImportProcess {
  origem: ImportacaoBllSource;
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
  itens: NormalizedImportItem[];
}

interface NormalizedImportDataset {
  origem: ImportacaoBllSource;
  atualizadoFonteEm: Date | null;
  detalhes: Record<string, unknown>;
  registros: NormalizedImportProcess[];
}

interface ExecuteImportOptions {
  origem: ImportacaoBllSource;
  modo: SyncMode;
  criadoPor?: number | null;
  agendada?: boolean;
  referenciaRotina?: string | null;
  urlFonte?: string | null;
  arquivoRegistrosNome?: string | null;
  arquivoItensNome?: string | null;
  dataset: NormalizedImportDataset;
}

interface ExecutionResult {
  executionId: number;
  origem: ImportacaoBllSource;
  totalRegistros: number;
  totalItens: number;
  status: ExecutionStatus;
  atualizadoFonteEm: Date | null;
}

let schedulerHandle: NodeJS.Timeout | null = null;
let schedulerRunning = false;
const activeSources = new Set<ImportacaoBllSource>();

function normalizeText(value: unknown) {
  const text = String(value ?? "").replace(/\u00a0/g, " ").trim();
  return text ? text : null;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function parseBrazilianNumber(value: unknown, scale = 2) {
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

function sumBrazilianNumbers(values: Array<string | null>) {
  const total = values.reduce((acc, value) => acc + Number.parseFloat(value ?? "0"), 0);
  return Number.isFinite(total) ? total.toFixed(2) : null;
}

function parseBrazilianDateTime(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{8}_\d{6}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    const hour = raw.slice(9, 11);
    const minute = raw.slice(11, 13);
    const second = raw.slice(13, 15);
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
  }

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInteger(value: unknown) {
  const digits = String(value ?? "").replace(/[^\d-]+/g, "");
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferYear(value: { ano?: unknown; numeroAdministrativo?: string | null; publicacao?: Date | null; conclusao?: Date | null }) {
  const explicitYear = parseInteger(value.ano);
  if (explicitYear >= 2000) return explicitYear;

  const numberMatch = String(value.numeroAdministrativo ?? "").match(/\/(20\d{2})$/);
  if (numberMatch) return Number.parseInt(numberMatch[1], 10);

  return value.publicacao?.getFullYear() ?? value.conclusao?.getFullYear() ?? null;
}

function getSourceTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IMPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, item.value]),
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number.parseInt(parts.hour, 10),
    minute: Number.parseInt(parts.minute, 10),
    second: Number.parseInt(parts.second, 10),
  };
}

function csvRowsToObjects(content: string) {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };

  const pushRow = () => {
    if (currentRow.length === 1 && currentRow[0] === "" && rows.length === 0) {
      currentRow = [];
      return;
    }
    rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      pushField();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      pushField();
      if (currentRow.some((field) => field.trim() !== "")) {
        pushRow();
      } else {
        currentRow = [];
      }
      continue;
    }

    currentField += char;
  }

  pushField();
  if (currentRow.some((field) => field.trim() !== "")) {
    pushRow();
  }

  if (!rows.length) {
    return [] as Array<Record<string, string>>;
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows
    .slice(1)
    .filter((row) => row.some((field) => field.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, columnIndex) => {
        record[header] = String(row[columnIndex] ?? "").trim();
      });
      return record;
    });
}

function pickValue(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeText(record[key]);
    if (value) return value;
  }
  return null;
}

function normalizeRemoteLicitacaoDataset(payload: Record<string, any>) {
  const processos = Array.isArray(payload.processos) ? payload.processos : [];
  const registros = processos.map((processo: Record<string, any>) => {
    const lotes = Array.isArray(processo.lotes) ? processo.lotes : [];
    const itens = lotes.flatMap((lote: Record<string, any>) => {
      const loteItens = Array.isArray(lote.itens) ? lote.itens : [];
      return loteItens.map((item: Record<string, any>) => ({
        loteNumero: normalizeText(lote.numero),
        itemNumero: normalizeText(item.numero),
        descricao: normalizeText(item.especificacao) ?? "Item sem especificacao",
        unidade: normalizeText(item.unidade),
        quantidade: parseBrazilianNumber(item.quantidade, 4),
        fornecedorNome: normalizeText(lote.vencedor),
        marca: null,
        modelo: null,
        valorReferencia: parseBrazilianNumber(item.valor_referencia),
        valorUnitario: null,
        subtotal: null,
        situacaoExterna: normalizeText(item.situacao) ?? normalizeText(lote.fase),
        faseExterna: normalizeText(lote.fase),
        dadosOriginais: item,
      }));
    });

    const publicacaoEm = parseBrazilianDateTime(processo.publicacao);
    const conclusaoEm = parseBrazilianDateTime(processo.conclusao);
    const inicioRecepcaoEm = parseBrazilianDateTime(processo.inicio_recepcao);
    const fimRecepcaoEm = parseBrazilianDateTime(processo.fim_recepcao);
    const inicioDisputaEm = parseBrazilianDateTime(processo.inicio_disputa);

    return {
      origem: "LICITACAO" as const,
      chaveExterna: normalizeText(processo.id) ?? normalizeText(processo.numero_edital) ?? normalizeText(processo.numero_adm) ?? `LICITACAO-${Date.now()}`,
      idOrigem: normalizeText(processo.id),
      numeroEdital: normalizeText(processo.id),
      numeroAdministrativo: normalizeText(processo.numero_adm),
      anoReferencia: inferYear({ numeroAdministrativo: normalizeText(processo.numero_adm), publicacao: publicacaoEm, conclusao: conclusaoEm }),
      modalidade: normalizeText(processo.modalidade) ?? "Modalidade nao informada",
      situacaoExterna: normalizeText(processo.situacao),
      tipoContrato: normalizeText(processo.tipo_contrato),
      artigo: null,
      inciso: null,
      objeto: normalizeText(processo.objeto) ?? "Objeto nao informado",
      condutorNome: normalizeText(processo.condutor),
      coordenadorNome: null,
      autoridadeNome: normalizeText(processo.autoridade),
      fornecedorNome: null,
      valorReferencia: sumBrazilianNumbers(
        lotes.map((lote: Record<string, any>) => parseBrazilianNumber(lote.valor_referencia)),
      ),
      valorTotal: null,
      publicacaoEm,
      conclusaoEm,
      inicioRecepcaoEm,
      fimRecepcaoEm,
      inicioDisputaEm,
      linkExterno: normalizeText(processo.link),
      totalLotes: parseInteger(processo.total_lotes),
      totalItens: parseInteger(processo.total_itens),
      dadosOriginais: processo,
      itens,
    } satisfies NormalizedImportProcess;
  });

  return {
    origem: "LICITACAO" as const,
    atualizadoFonteEm: parseBrazilianDateTime(payload.metadata?.atualizado_em),
    detalhes: payload.metadata ?? {},
    registros,
  } satisfies NormalizedImportDataset;
}

function normalizeRemoteCompraDiretaDataset(payload: Record<string, any>) {
  const registros = Array.isArray(payload.registros) ? payload.registros : [];
  const normalized = registros.map((registro: Record<string, any>) => {
    const itens = Array.isArray(registro.itens)
      ? registro.itens.map((item: Record<string, any>) => {
          const quantidade = parseBrazilianNumber(item.quantidade, 4);
          const valorUnitario = parseBrazilianNumber(item.valor);
          const subtotal = quantidade && valorUnitario
            ? (Number.parseFloat(quantidade) * Number.parseFloat(valorUnitario)).toFixed(2)
            : valorUnitario;
          return {
            loteNumero: null,
            itemNumero: normalizeText(item.numero),
            descricao: normalizeText(item.descricao) ?? "Item sem descricao",
            unidade: normalizeText(item.unidade),
            quantidade,
            fornecedorNome: normalizeText(item.fornecedor),
            marca: normalizeText(item.marca),
            modelo: normalizeText(item.modelo),
            valorReferencia: null,
            valorUnitario,
            subtotal,
            situacaoExterna: normalizeText(registro.status),
            faseExterna: null,
            dadosOriginais: item,
          } satisfies NormalizedImportItem;
        })
      : [];

    const publicacaoEm = parseBrazilianDateTime(registro.data_publicacao);
    const conclusaoEm = parseBrazilianDateTime(registro.data_conclusao);

    return {
      origem: "COMPRA_DIRETA" as const,
      chaveExterna: normalizeText(registro.id) ?? normalizeText(registro.numero_adm) ?? `COMPRA_DIRETA-${Date.now()}`,
      idOrigem: normalizeText(registro.id),
      numeroEdital: null,
      numeroAdministrativo: normalizeText(registro.numero_adm),
      anoReferencia: inferYear({ ano: registro.ano_referencia, numeroAdministrativo: normalizeText(registro.numero_adm), publicacao: publicacaoEm, conclusao: conclusaoEm }),
      modalidade: normalizeText(registro.modalidade) ?? "Modalidade nao informada",
      situacaoExterna: normalizeText(registro.status),
      tipoContrato: null,
      artigo: normalizeText(registro.artigo),
      inciso: normalizeText(registro.inciso),
      objeto: normalizeText(registro.objeto) ?? "Objeto nao informado",
      condutorNome: null,
      coordenadorNome: normalizeText(registro.coordenador),
      autoridadeNome: normalizeText(registro.autoridade),
      fornecedorNome: itens.length === 1 ? itens[0].fornecedorNome : null,
      valorReferencia: null,
      valorTotal: sumBrazilianNumbers(itens.map((item) => item.subtotal)),
      publicacaoEm,
      conclusaoEm,
      inicioRecepcaoEm: null,
      fimRecepcaoEm: null,
      inicioDisputaEm: null,
      linkExterno: normalizeText(registro.link),
      totalLotes: 0,
      totalItens: parseInteger(registro.total_itens),
      dadosOriginais: registro,
      itens,
    } satisfies NormalizedImportProcess;
  });

  return {
    origem: "COMPRA_DIRETA" as const,
    atualizadoFonteEm: parseBrazilianDateTime(payload.metadata?.atualizado_em),
    detalhes: payload.metadata ?? {},
    registros: normalized,
  } satisfies NormalizedImportDataset;
}

function normalizeCsvLicitacaoDataset(registrosContent: string, itensContent: string) {
  const registros = csvRowsToObjects(registrosContent);
  const itens = csvRowsToObjects(itensContent);
  const itensPorProcesso = new Map<string, Array<Record<string, string>>>();

  for (const item of itens) {
    const processKey = pickValue(item, ["processo", "n_edital", "numero_edital"]);
    if (!processKey) continue;
    const group = itensPorProcesso.get(processKey) ?? [];
    group.push(item);
    itensPorProcesso.set(processKey, group);
  }

  const normalized = registros.map((registro) => {
    const externalKey = pickValue(registro, ["n_edital", "numero_edital", "processo", "id"]) ?? `LICITACAO-${Date.now()}`;
    const relatedItems = itensPorProcesso.get(externalKey) ?? [];
    const publicacaoEm = parseBrazilianDateTime(pickValue(registro, ["publicacao"]));
    const conclusaoEm = parseBrazilianDateTime(pickValue(registro, ["conclusao"]));

    return {
      origem: "LICITACAO" as const,
      chaveExterna: externalKey,
      idOrigem: externalKey,
      numeroEdital: externalKey,
      numeroAdministrativo: null,
      anoReferencia: inferYear({ numeroAdministrativo: null, publicacao: publicacaoEm, conclusao: conclusaoEm }),
      modalidade: pickValue(registro, ["modalidade"]) ?? "Modalidade nao informada",
      situacaoExterna: pickValue(registro, ["situacao", "status"]),
      tipoContrato: pickValue(registro, ["tipo_contrato"]),
      artigo: null,
      inciso: null,
      objeto: pickValue(registro, ["objeto"]) ?? "Objeto nao informado",
      condutorNome: pickValue(registro, ["condutor"]),
      coordenadorNome: null,
      autoridadeNome: pickValue(registro, ["autoridade"]),
      fornecedorNome: null,
      valorReferencia: parseBrazilianNumber(pickValue(registro, ["valor_ref_r", "valor_ref"])),
      valorTotal: null,
      publicacaoEm,
      conclusaoEm,
      inicioRecepcaoEm: null,
      fimRecepcaoEm: parseBrazilianDateTime(pickValue(registro, ["fim_recepcao"])),
      inicioDisputaEm: parseBrazilianDateTime(pickValue(registro, ["inicio_disputa"])),
      linkExterno: null,
      totalLotes: parseInteger(pickValue(registro, ["lotes"])),
      totalItens: parseInteger(pickValue(registro, ["itens"])) || relatedItems.length,
      dadosOriginais: registro,
      itens: relatedItems.map((item, index) => ({
        loteNumero: pickValue(item, ["lote"]),
        itemNumero: String(index + 1),
        descricao: pickValue(item, ["especificacao", "descricao"]) ?? "Item sem descricao",
        unidade: pickValue(item, ["unidade"]),
        quantidade: parseBrazilianNumber(pickValue(item, ["quantidade"]), 4),
        fornecedorNome: null,
        marca: null,
        modelo: null,
        valorReferencia: parseBrazilianNumber(pickValue(item, ["valor_ref_r", "valor_ref"])),
        valorUnitario: null,
        subtotal: null,
        situacaoExterna: pickValue(item, ["situacao", "status"]),
        faseExterna: pickValue(item, ["situacao", "status"]),
        dadosOriginais: item,
      })),
    } satisfies NormalizedImportProcess;
  });

  return {
    origem: "LICITACAO" as const,
    atualizadoFonteEm: null,
    detalhes: {
      origem: "csv_manual",
      total_registros_csv: registros.length,
      total_itens_csv: itens.length,
    },
    registros: normalized,
  } satisfies NormalizedImportDataset;
}

function normalizeCsvCompraDiretaDataset(registrosContent: string, itensContent: string) {
  const registros = csvRowsToObjects(registrosContent);
  const itens = csvRowsToObjects(itensContent);
  const itensPorProcesso = new Map<string, Array<Record<string, string>>>();

  for (const item of itens) {
    const processKey = pickValue(item, ["id_compra", "id", "processo"]);
    if (!processKey) continue;
    const group = itensPorProcesso.get(processKey) ?? [];
    group.push(item);
    itensPorProcesso.set(processKey, group);
  }

  const normalized = registros.map((registro) => {
    const externalKey = pickValue(registro, ["id", "numero_administrativo", "objeto"]) ?? `COMPRA_DIRETA-${Date.now()}`;
    const relatedItems = itensPorProcesso.get(externalKey) ?? [];
    const publicacaoEm = parseBrazilianDateTime(pickValue(registro, ["publicacao", "data_publicacao"]));
    const conclusaoEm = parseBrazilianDateTime(pickValue(registro, ["conclusao", "data_conclusao"]));

    return {
      origem: "COMPRA_DIRETA" as const,
      chaveExterna: externalKey,
      idOrigem: externalKey,
      numeroEdital: null,
      numeroAdministrativo: null,
      anoReferencia: inferYear({ numeroAdministrativo: null, publicacao: publicacaoEm, conclusao: conclusaoEm }),
      modalidade: pickValue(registro, ["modalidade"]) ?? "Modalidade nao informada",
      situacaoExterna: pickValue(registro, ["status", "situacao"]),
      tipoContrato: null,
      artigo: pickValue(registro, ["artigo"]),
      inciso: pickValue(registro, ["inciso"]),
      objeto: pickValue(registro, ["objeto"]) ?? "Objeto nao informado",
      condutorNome: null,
      coordenadorNome: pickValue(registro, ["coordenador"]),
      autoridadeNome: pickValue(registro, ["autoridade"]),
      fornecedorNome: pickValue(registro, ["fornecedor"]),
      valorReferencia: null,
      valorTotal: parseBrazilianNumber(pickValue(registro, ["valor_total_r", "valor_total"])),
      publicacaoEm,
      conclusaoEm,
      inicioRecepcaoEm: null,
      fimRecepcaoEm: null,
      inicioDisputaEm: null,
      linkExterno: null,
      totalLotes: 0,
      totalItens: relatedItems.length,
      dadosOriginais: registro,
      itens: relatedItems.map((item) => ({
        loteNumero: null,
        itemNumero: pickValue(item, ["n", "numero"]),
        descricao: pickValue(item, ["descricao"]) ?? "Item sem descricao",
        unidade: pickValue(item, ["unidade"]),
        quantidade: parseBrazilianNumber(pickValue(item, ["quantidade"]), 4),
        fornecedorNome: pickValue(item, ["fornecedor"]),
        marca: null,
        modelo: null,
        valorReferencia: null,
        valorUnitario: parseBrazilianNumber(pickValue(item, ["valor_unit_r", "valor_unitario"])),
        subtotal: parseBrazilianNumber(pickValue(item, ["subtotal_r", "subtotal"])),
        situacaoExterna: pickValue(item, ["status", "situacao"]),
        faseExterna: null,
        dadosOriginais: item,
      })),
    } satisfies NormalizedImportProcess;
  });

  return {
    origem: "COMPRA_DIRETA" as const,
    atualizadoFonteEm: null,
    detalhes: {
      origem: "csv_manual",
      total_registros_csv: registros.length,
      total_itens_csv: itens.length,
    },
    registros: normalized,
  } satisfies NormalizedImportDataset;
}

async function fetchRemoteDataset(source: ImportacaoBllSource) {
  const response = await fetch(remoteImportSources[source].url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar a fonte publica (${response.status}).`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function persistNormalizedDataset(options: ExecuteImportOptions): Promise<ExecutionResult> {
  const db = requireDb();
  const lockKey = options.origem;

  if (activeSources.has(lockKey)) {
    throw new Error(`Ja existe uma importacao em andamento para ${remoteImportSources[options.origem].label}.`);
  }

  activeSources.add(lockKey);

  const [execution] = await db.insert(importacaoBllExecucoes).values({
    origem: options.origem,
    modo: options.modo,
    status: "PROCESSANDO",
    agendada: options.agendada ?? false,
    referenciaRotina: options.referenciaRotina ?? null,
    urlFonte: options.urlFonte ?? null,
    arquivoRegistrosNome: options.arquivoRegistrosNome ?? null,
    arquivoItensNome: options.arquivoItensNome ?? null,
    atualizadoFonteEm: options.dataset.atualizadoFonteEm,
    detalhes: options.dataset.detalhes,
    criadoPor: options.criadoPor ?? null,
  }).returning({ id: importacaoBllExecucoes.id });

  try {
    const totalItens = options.dataset.registros.reduce((acc, registro) => acc + registro.itens.length, 0);
    const importedIds: number[] = [];

    await db.transaction(async (tx) => {
      for (const registro of options.dataset.registros) {
        const [savedProcess] = await tx
          .insert(importacaoBllProcessos)
          .values({
            origem: registro.origem,
            chaveExterna: registro.chaveExterna,
            idOrigem: registro.idOrigem,
            numeroEdital: registro.numeroEdital,
            numeroAdministrativo: registro.numeroAdministrativo,
            anoReferencia: registro.anoReferencia,
            modalidade: registro.modalidade,
            situacaoExterna: registro.situacaoExterna,
            tipoContrato: registro.tipoContrato,
            artigo: registro.artigo,
            inciso: registro.inciso,
            objeto: registro.objeto,
            condutorNome: registro.condutorNome,
            coordenadorNome: registro.coordenadorNome,
            autoridadeNome: registro.autoridadeNome,
            fornecedorNome: registro.fornecedorNome,
            valorReferencia: registro.valorReferencia,
            valorTotal: registro.valorTotal,
            publicacaoEm: registro.publicacaoEm,
            conclusaoEm: registro.conclusaoEm,
            inicioRecepcaoEm: registro.inicioRecepcaoEm,
            fimRecepcaoEm: registro.fimRecepcaoEm,
            inicioDisputaEm: registro.inicioDisputaEm,
            linkExterno: registro.linkExterno,
            totalLotes: registro.totalLotes,
            totalItens: registro.totalItens,
            ultimaExecucaoId: execution.id,
            ultimaAtualizacaoEm: new Date(),
            dadosOriginais: registro.dadosOriginais,
          })
          .onConflictDoUpdate({
            target: [importacaoBllProcessos.origem, importacaoBllProcessos.chaveExterna],
            set: {
              idOrigem: registro.idOrigem,
              numeroEdital: registro.numeroEdital,
              numeroAdministrativo: registro.numeroAdministrativo,
              anoReferencia: registro.anoReferencia,
              modalidade: registro.modalidade,
              situacaoExterna: registro.situacaoExterna,
              tipoContrato: registro.tipoContrato,
              artigo: registro.artigo,
              inciso: registro.inciso,
              objeto: registro.objeto,
              condutorNome: registro.condutorNome,
              coordenadorNome: registro.coordenadorNome,
              autoridadeNome: registro.autoridadeNome,
              fornecedorNome: registro.fornecedorNome,
              valorReferencia: registro.valorReferencia,
              valorTotal: registro.valorTotal,
              publicacaoEm: registro.publicacaoEm,
              conclusaoEm: registro.conclusaoEm,
              inicioRecepcaoEm: registro.inicioRecepcaoEm,
              fimRecepcaoEm: registro.fimRecepcaoEm,
              inicioDisputaEm: registro.inicioDisputaEm,
              linkExterno: registro.linkExterno,
              totalLotes: registro.totalLotes,
              totalItens: registro.totalItens,
              ultimaExecucaoId: execution.id,
              ultimaAtualizacaoEm: new Date(),
              dadosOriginais: registro.dadosOriginais,
            },
          })
          .returning({ id: importacaoBllProcessos.id });

        importedIds.push(savedProcess.id);

        await tx.delete(importacaoBllItens).where(eq(importacaoBllItens.processoImportadoId, savedProcess.id));

        if (registro.itens.length) {
          await tx.insert(importacaoBllItens).values(
            registro.itens.map((item) => ({
              processoImportadoId: savedProcess.id,
              loteNumero: item.loteNumero,
              itemNumero: item.itemNumero,
              descricao: item.descricao,
              unidade: item.unidade,
              quantidade: item.quantidade,
              fornecedorNome: item.fornecedorNome,
              marca: item.marca,
              modelo: item.modelo,
              valorReferencia: item.valorReferencia,
              valorUnitario: item.valorUnitario,
              subtotal: item.subtotal,
              situacaoExterna: item.situacaoExterna,
              faseExterna: item.faseExterna,
              dadosOriginais: item.dadosOriginais,
              atualizadoEm: new Date(),
            })),
          );
        }
      }
    });

    await refreshConciliationForImportedIds(importedIds);

    await db
      .update(importacaoBllExecucoes)
      .set({
        status: "CONCLUIDA",
        totalRegistros: options.dataset.registros.length,
        totalItens,
        mensagem: `Importacao concluida com ${options.dataset.registros.length} registro(s) e ${totalItens} item(ns).`,
        finalizadoEm: new Date(),
      })
      .where(eq(importacaoBllExecucoes.id, execution.id));

    return {
      executionId: execution.id,
      origem: options.origem,
      totalRegistros: options.dataset.registros.length,
      totalItens,
      status: "CONCLUIDA",
      atualizadoFonteEm: options.dataset.atualizadoFonteEm,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar a importacao.";
    await db
      .update(importacaoBllExecucoes)
      .set({
        status: "ERRO",
        mensagem: message,
        finalizadoEm: new Date(),
      })
      .where(eq(importacaoBllExecucoes.id, execution.id));
    throw error;
  } finally {
    activeSources.delete(lockKey);
  }
}

export async function syncRemoteImport(source: ImportacaoBllSource, options?: { criadoPor?: number | null; agendada?: boolean; referenciaRotina?: string | null }) {
  const payload = await fetchRemoteDataset(source);
  const dataset = source === "LICITACAO" ? normalizeRemoteLicitacaoDataset(payload) : normalizeRemoteCompraDiretaDataset(payload);
  return persistNormalizedDataset({
    origem: source,
    modo: "REMOTA_JSON",
    criadoPor: options?.criadoPor ?? null,
    agendada: options?.agendada ?? false,
    referenciaRotina: options?.referenciaRotina ?? null,
    urlFonte: remoteImportSources[source].url,
    dataset,
  });
}

export async function syncAllRemoteImports(options?: { criadoPor?: number | null; agendada?: boolean; referenciaRotina?: string | null }) {
  const results: ExecutionResult[] = [];
  for (const source of Object.keys(remoteImportSources) as ImportacaoBllSource[]) {
    results.push(
      await syncRemoteImport(source, {
        criadoPor: options?.criadoPor ?? null,
        agendada: options?.agendada ?? false,
        referenciaRotina: options?.referenciaRotina ?? null,
      }),
    );
  }
  return results;
}

export async function importCsvBundle(params: {
  source: ImportacaoBllSource;
  registrosFilename: string;
  registrosContent: string;
  itensFilename: string;
  itensContent: string;
  criadoPor?: number | null;
}) {
  const dataset = params.source === "LICITACAO"
    ? normalizeCsvLicitacaoDataset(params.registrosContent, params.itensContent)
    : normalizeCsvCompraDiretaDataset(params.registrosContent, params.itensContent);

  return persistNormalizedDataset({
    origem: params.source,
    modo: "CSV_MANUAL",
    criadoPor: params.criadoPor ?? null,
    arquivoRegistrosNome: params.registrosFilename,
    arquivoItensNome: params.itensFilename,
    dataset,
  });
}

export function getImportSchedulerConfig() {
  return {
    automaticEnabled: IMPORT_AUTOMATIC_ENABLED,
    timezone: IMPORT_TIMEZONE,
    dailyHour: Number.isFinite(IMPORT_DAILY_HOUR) ? IMPORT_DAILY_HOUR : 7,
    method: "JSON publico consolidado",
    sources: remoteImportSources,
  };
}

async function runScheduledImportTick() {
  if (!databaseEnabled || schedulerRunning || !IMPORT_AUTOMATIC_ENABLED) {
    return;
  }

  const now = getSourceTimeParts();
  const targetHour = Number.isFinite(IMPORT_DAILY_HOUR) ? IMPORT_DAILY_HOUR : 7;
  if (now.hour < targetHour) {
    return;
  }

  schedulerRunning = true;
  try {
    const db = requireDb();
    const existing = await db
      .select({ origem: importacaoBllExecucoes.origem })
      .from(importacaoBllExecucoes)
      .where(
        and(
          eq(importacaoBllExecucoes.agendada, true),
          eq(importacaoBllExecucoes.referenciaRotina, now.dateKey),
          eq(importacaoBllExecucoes.status, "CONCLUIDA"),
        ),
      )
      .orderBy(desc(importacaoBllExecucoes.iniciadoEm))
      .limit(4);

    const completedOrigins = new Set(existing.map((row) => row.origem));
    if (completedOrigins.size >= Object.keys(remoteImportSources).length) {
      return;
    }

    await syncAllRemoteImports({
      agendada: true,
      referenciaRotina: now.dateKey,
      criadoPor: null,
    });
  } catch (error) {
    console.error("Falha na rotina automatica de importacao BLL:", error);
  } finally {
    schedulerRunning = false;
  }
}

export function startImportacoesScheduler() {
  if (schedulerHandle || !IMPORT_AUTOMATIC_ENABLED) {
    return;
  }

  void runScheduledImportTick();
  schedulerHandle = setInterval(() => {
    void runScheduledImportTick();
  }, SCHEDULER_POLL_INTERVAL_MS);
}

export async function getImportSummaryCounts() {
  const db = requireDb();
  const processRows = await db
    .select({
      origem: importacaoBllProcessos.origem,
      total: sql<number>`count(*)::int`,
      itens: sql<number>`coalesce(sum(${importacaoBllProcessos.totalItens}), 0)::int`,
    })
    .from(importacaoBllProcessos)
    .groupBy(importacaoBllProcessos.origem);

  const executionRows = await db
    .select()
    .from(importacaoBllExecucoes)
    .orderBy(desc(importacaoBllExecucoes.iniciadoEm), desc(importacaoBllExecucoes.id))
    .limit(20);

  return { processRows, executionRows };
}
