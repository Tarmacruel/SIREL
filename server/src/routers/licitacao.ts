import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

import {
  getLicitacaoChecklistCategories,
  licitacaoInternalDocumentChecklist,
  licitacaoPrazoBasePorModalidade,
  prazoProcessualTipoLabels,
} from "@sirel/shared/const";
import {
  licitacaoAdvanceStageInputSchema,
  licitacaoDetailInputSchema,
  licitacaoDeleteLicitanteInputSchema,
  licitacaoHomologarInputSchema,
  licitacaoChecklistNaoAplicavelInputSchema,
  licitacaoListInputSchema,
  licitacaoPublishInputSchema,
  licitacaoQuickFornecedorInputSchema,
  licitacaoSaveConfiguracaoInputSchema,
  licitacaoSaveHabilitacaoInputSchema,
  licitacaoSaveLanceInputSchema,
  licitacaoSaveLicitanteInputSchema,
  licitacaoSavePropostaInputSchema,
  licitacaoSaveRecursoInputSchema,
} from "@sirel/shared/schemas/licitacao";

import type { AppContext } from "../_core/context.js";
import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  documentos,
  fornecedores,
  itensProcesso,
  lancesLicitacao,
  licitacaoChecklistExcecoes,
  licitacaoStatusEnum,
  licitacoes,
  licitantes,
  modalidades,
  movimentacoesWorkflow,
  pessoas,
  prazosProcessuais,
  processos,
  propostasLicitacao,
  recursosLicitacao,
  secretarias,
  statusProcesso,
  users,
  workflowProcesso,
} from "../db/schema.js";
import { getNextNumeroEdital } from "../lib/processo-identity.js";
import { getSystemParamNumber, getSystemParamNumberArray } from "../lib/system-params.js";
import { operadorProcedure, publicProcedure, router } from "../trpc.js";

type DbClient = ReturnType<typeof requireDb>;
type LicitacaoStatus = (typeof licitacaoStatusEnum.enumValues)[number];

function parseOptionalTimestamp(value?: string | null) {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Data/hora inválida: ${value}` });
  }
  return parsed;
}

function parseOptionalTimestampLoose(value?: string | Date | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Data/hora inválida: ${value}` });
  }
  return parsed;
}


function parseOptionalDate(value?: string | null) {
  if (!value?.trim()) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Data inválida: ${value}` });
  }
  return value;
}

function nowDateString() {
  return new Date().toISOString().slice(0, 10);
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addBusinessDays(source: Date, businessDays: number) {
  const cursor = startOfDay(source);
  let remaining = businessDays;

  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return cursor;
}

function combineDateAndTime(date: Date, hours = 8, minutes = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function extractTimeParts(source?: Date | null) {
  if (!source) {
    return { hours: 8, minutes: 30 };
  }

  return {
    hours: source.getHours(),
    minutes: source.getMinutes(),
  };
}

function toNullableText(value?: string | null) {
  return value?.trim() ? value.trim() : null;
}

function normalizeDigits(value?: string | null) {
  return String(value ?? "").replace(/\D+/g, "");
}

function formatCnpj(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length !== 14) return digits;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function buildDocumentoUrl(documentoId: number) {
  return `/api/planejamento/documentos/${documentoId}/download`;
}

function supportsLances(modalidadeCodigo?: string | null) {
  return Boolean(modalidadeCodigo && /(PREGAO|LEILAO)/.test(modalidadeCodigo));
}

function isObjetoConcorrenciaObras(tipoObjeto?: string | null) {
  return tipoObjeto === "OBRA" || tipoObjeto === "SERVICO_ENG";
}

function getPublicationExtraDays(publicarNoDou?: boolean | null, publicarEmJornal?: boolean | null) {
  return publicarNoDou || publicarEmJornal ? 1 : 0;
}

async function buildPublicationSchedule(db: DbClient, params: {
  modalidadeCodigo?: string | null;
  tipoObjeto?: string | null;
  dataPublicacaoEdital?: Date | null;
  publicarNoDou?: boolean | null;
  publicarEmJornal?: boolean | null;
  dataAberturaPropostas?: Date | null;
}) {
  if (!params.dataPublicacaoEdital || !params.modalidadeCodigo) {
    return null;
  }

  const defaultBaseDays = licitacaoPrazoBasePorModalidade[params.modalidadeCodigo as keyof typeof licitacaoPrazoBasePorModalidade] ?? 8;
  let baseDays = defaultBaseDays;

  if (/PREGAO/.test(params.modalidadeCodigo)) {
    baseDays = await getSystemParamNumber(db, "PRAZOS.PREGAO.RECEBIMENTO_PROPOSTAS_DIAS_UTEIS", defaultBaseDays);
  } else if (/CONCORRENCIA/.test(params.modalidadeCodigo)) {
    baseDays = isObjetoConcorrenciaObras(params.tipoObjeto)
      ? await getSystemParamNumber(db, "PRAZOS.CONCORRENCIA.OBRAS_DIAS_UTEIS", defaultBaseDays)
      : await getSystemParamNumber(db, "PRAZOS.CONCORRENCIA.SERVICOS_DIAS_UTEIS", defaultBaseDays);
  } else if (/DISPENSA/.test(params.modalidadeCodigo)) {
    baseDays = await getSystemParamNumber(db, "PRAZOS.DISPENSA.PUBLICACAO_RESUMO_DIAS_UTEIS", defaultBaseDays);
  }

  const municipioExtra = 1;
  const canaisExtra = getPublicationExtraDays(params.publicarNoDou, params.publicarEmJornal);
  const totalBusinessDays = baseDays + municipioExtra + canaisExtra;
  const startOffset = 1 + municipioExtra + canaisExtra;
  const publicacaoDia = startOfDay(params.dataPublicacaoEdital);
  const recebimentoInicial = addBusinessDays(publicacaoDia, startOffset);
  const disputaDia = addBusinessDays(publicacaoDia, totalBusinessDays);
  const disputeTime = extractTimeParts(params.dataAberturaPropostas);
  const abertura = combineDateAndTime(disputaDia, disputeTime.hours, disputeTime.minutes);
  const encerramento = new Date(abertura.getTime() - 15 * 60 * 1000);

  return {
    baseDays,
    municipioExtra,
    canaisExtra,
    startOffset,
    totalBusinessDays,
    dataPublicacaoEdital: combineDateAndTime(publicacaoDia, 8, 0),
    dataRecebimentoPropostasInicio: combineDateAndTime(recebimentoInicial, 8, 0),
    dataRecebimentoPropostasFim: encerramento,
    dataAberturaPropostas: abertura,
  };
}

function buildManualSchedule(params: {
  dataPublicacaoEdital?: string | Date | null;
  dataRecebimentoPropostasInicio?: string | Date | null;
  dataRecebimentoPropostasFim?: string | Date | null;
  dataAberturaPropostas?: string | Date | null;
}) {
  const dataPublicacaoEdital = parseOptionalTimestampLoose(params.dataPublicacaoEdital);
  const dataRecebimentoPropostasInicio = parseOptionalTimestampLoose(params.dataRecebimentoPropostasInicio);
  const dataRecebimentoPropostasFim = parseOptionalTimestampLoose(params.dataRecebimentoPropostasFim);
  const dataAberturaPropostas = parseOptionalTimestampLoose(params.dataAberturaPropostas);

  if (!dataPublicacaoEdital || !dataRecebimentoPropostasFim || !dataAberturaPropostas) {
    return null;
  }

  return {
    baseDays: 0,
    municipioExtra: 0,
    canaisExtra: 0,
    startOffset: 0,
    totalBusinessDays: 0,
    dataPublicacaoEdital,
    dataRecebimentoPropostasInicio: dataRecebimentoPropostasInicio ?? dataPublicacaoEdital,
    dataRecebimentoPropostasFim,
    dataAberturaPropostas,
  };
}

function normalizeAuditValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? null;
}

function buildAuditChanges<T extends Record<string, unknown>>(before: T, after: T, fields: { key: keyof T; label: string }[]) {
  return fields
    .map((field) => {
      const previous = normalizeAuditValue(before[field.key]);
      const next = normalizeAuditValue(after[field.key]);
      return { ...field, previous, next, changed: previous !== next };
    })
    .filter((item) => item.changed);
}

async function logAuditoriaDetalhada(
  ctx: AppContext,
  params: {
    tabela: string;
    registroId: number;
    changes: { key: string | number | symbol; label: string; previous: unknown; next: unknown }[];
    justificativa?: string | null;
    prefixo?: string;
  },
) {
  if (!params.changes.length) return;
  await Promise.all(
    params.changes.map((change) =>
      logAuditoria(ctx, {
        tabela: params.tabela,
        registroId: params.registroId,
        acao: "UPDATE",
        dadosAnteriores: { campo: change.label, valor: change.previous },
        dadosNovos: { campo: change.label, valor: change.next },
        descricao: `${params.prefixo ?? "Alteração fora do fluxo"}: ${String(change.label)} ajustado${params.justificativa ? ` | Justificativa: ${params.justificativa}` : ""}`,
      }),
    ),
  );
}

async function getChecklistDocuments(db: DbClient, processoId: number) {
  const rows = await db
    .select({
      id: documentos.id,
      categoria: documentos.categoria,
      titulo: documentos.titulo,
      arquivoUrl: documentos.arquivoUrl,
      criadoEm: documentos.criadoEm,
    })
    .from(documentos)
    .where(eq(documentos.processoId, processoId))
    .orderBy(desc(documentos.criadoEm), desc(documentos.id));

  return rows.map((item) => ({ ...item, arquivoUrl: buildDocumentoUrl(item.id) }));
}

async function getChecklistOverrides(db: DbClient, processoId: number) {
  const rows = await db
    .select({
      id: licitacaoChecklistExcecoes.id,
      categoria: licitacaoChecklistExcecoes.categoria,
      naoAplicavel: licitacaoChecklistExcecoes.naoAplicavel,
      justificativa: licitacaoChecklistExcecoes.justificativa,
    })
    .from(licitacaoChecklistExcecoes)
    .where(eq(licitacaoChecklistExcecoes.processoId, processoId));

  const overrides = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const category = row.categoria?.trim();
    if (!category) return;
    overrides.set(category, row);
  });
  return overrides;
}

async function buildInternalChecklist(
  db: DbClient,
  processoId: number,
  exigeDeclaracaoNaoFracionamento: boolean,
  modalidadeCodigo?: string | null,
  modoDisputa?: string | null,
) {
  const docs = await getChecklistDocuments(db, processoId);
  const overrides = await getChecklistOverrides(db, processoId);
  const byCategory = new Map<string, (typeof docs)[number][]>();

  docs.forEach((documento) => {
    const category = documento.categoria?.trim();
    if (!category) return;
    byCategory.set(category, [...(byCategory.get(category) ?? []), documento]);
  });

  const allowedCategories = new Set(
    getLicitacaoChecklistCategories({ modalidadeCodigo, modoDisputa }),
  );

  const itens = licitacaoInternalDocumentChecklist
    .filter((item) => allowedCategories.has(item.category))
    .filter((item) => !("condicional" in item) || item.condicional !== "DECLARACAO_NAO_FRACIONAMENTO" || exigeDeclaracaoNaoFracionamento)
    .map((item) => {
      const documentosCategoria = byCategory.get(item.category) ?? [];
      const override = overrides.get(item.category);
      const naoAplicavel = Boolean(override?.naoAplicavel);
      return {
        ...item,
        concluido: documentosCategoria.length > 0 || naoAplicavel,
        naoAplicavel,
        justificativaNaoAplicavel: override?.justificativa ?? null,
        documentos: documentosCategoria,
      };
    });

  return {
    itens,
    obrigatoriosPendentes: itens.filter((item) => item.obrigatorio && !item.concluido),
  };
}

async function syncPublicationDeadlines(
  db: DbClient,
  processoId: number,
  schedule: Awaited<ReturnType<typeof buildPublicationSchedule>>,
  userId?: number | null,
) {
  if (!schedule) return;

  const alertDays = await getSystemParamNumberArray(db, "NOTIFICACOES.ALERTA_PRAZO_DIAS", [7, 3, 1]);

  const deadlineItems = [
    {
      tipo: "PUBLICACAO_EDITAL" as const,
      titulo: prazoProcessualTipoLabels.PUBLICACAO_EDITAL,
      dataPrevista: schedule.dataPublicacaoEdital.toISOString().slice(0, 10),
    },
    {
      tipo: "RECEBIMENTO_PROPOSTAS" as const,
      titulo: prazoProcessualTipoLabels.RECEBIMENTO_PROPOSTAS,
      dataPrevista: schedule.dataRecebimentoPropostasFim.toISOString().slice(0, 10),
    },
    {
      tipo: "SESSAO_PUBLICA" as const,
      titulo: prazoProcessualTipoLabels.SESSAO_PUBLICA,
      dataPrevista: schedule.dataAberturaPropostas.toISOString().slice(0, 10),
    },
  ];

  for (const item of deadlineItems) {
    const [existing] = await db
      .select()
      .from(prazosProcessuais)
      .where(and(eq(prazosProcessuais.processoId, processoId), eq(prazosProcessuais.tipo, item.tipo)))
      .limit(1);

    if (existing) {
      await db
        .update(prazosProcessuais)
        .set({
          titulo: item.titulo,
          dataPrevista: item.dataPrevista,
          atualizadoEm: new Date(),
        })
        .where(eq(prazosProcessuais.id, existing.id));
      continue;
    }

    await db.insert(prazosProcessuais).values({
      processoId,
      tipo: item.tipo,
      titulo: item.titulo,
      dataPrevista: item.dataPrevista,
      status: new Date(`${item.dataPrevista}T00:00:00`) < startOfDay() ? "EM_ATRASO" : "PENDENTE",
      alertasConfig: { lembretes: alertDays, canais: ["sistema"] },
      criadoPor: userId ?? null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }
}

async function ensureLicitacao(db: DbClient, processoId: number) {
  const [existing] = await db.select().from(licitacoes).where(eq(licitacoes.processoId, processoId)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(licitacoes).values({
    processoId,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  }).returning();

  return created;
}

async function syncWorkflowStep(
  db: DbClient,
  processoId: number,
  etapaAtual: string,
  situacao: "RASCUNHO" | "EM_ANDAMENTO" | "AGUARDANDO" | "CONCLUIDO" | "SUSPENSO" = "EM_ANDAMENTO",
) {
  const [current] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, processoId)).limit(1);

  if (current) {
    await db.update(workflowProcesso).set({
      moduloAtual: "LICITACAO",
      situacao,
      etapaAtual,
      atualizadoEm: new Date(),
      dataInicio: current.dataInicio ?? nowDateString(),
      dataConclusao: situacao === "CONCLUIDO" ? nowDateString() : null,
    }).where(eq(workflowProcesso.processoId, processoId));
    return;
  }

  await db.insert(workflowProcesso).values({
    processoId,
    moduloAtual: "LICITACAO",
    situacao,
    etapaAtual,
    dataInicio: nowDateString(),
    dataConclusao: situacao === "CONCLUIDO" ? nowDateString() : null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  });
}

async function appendMovement(
  db: DbClient,
  params: {
    processoId: number;
    usuarioId?: number | null;
    descricao: string;
    observacao?: string | null;
  },
) {
  await db.insert(movimentacoesWorkflow).values({
    processoId: params.processoId,
    moduloOrigem: "LICITACAO",
    moduloDestino: "LICITACAO",
    descricao: params.descricao,
    observacao: params.observacao ?? null,
    usuarioId: params.usuarioId ?? null,
    criadoEm: new Date(),
  });
}

async function getBaseProcesso(db: DbClient, processoId: number) {
  const [processo] = await db
    .select({
      id: processos.id,
      numeroSirel: processos.numeroSirel,
      numeroEdital: processos.numeroEdital,
      numeroAdministrativo: processos.numeroAdministrativo,
      objeto: processos.objeto,
      anoReferencia: processos.anoReferencia,
      foraDoFluxo: processos.foraDoFluxo,
      secretariaId: processos.secretariaId,
      secretaria: secretarias.nome,
      modalidadeId: processos.modalidadeId,
      modalidade: modalidades.nome,
      modalidadeCodigo: modalidades.codigo,
      statusId: processos.statusId,
      statusProcesso: statusProcesso.nome,
      criterioJulgamento: processos.criterioJulgamento,
      modoDisputa: processos.modoDisputa,
      tipoObjeto: processos.tipoObjeto,
      valorEstimado: processos.valorEstimado,
      dataAbertura: processos.dataAbertura,
      publicado: processos.publicado,
      condutorProcessoId: processos.condutorProcessoId,
      homologado: processos.homologado,
    })
    .from(processos)
    .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
    .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
    .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
    .where(eq(processos.id, processoId))
    .limit(1);

  if (!processo) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado." });
  }

  return processo;
}

export const licitacaoRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const [totalRow] = await db
      .select({ total: count() })
      .from(workflowProcesso)
      .where(eq(workflowProcesso.moduloAtual, "LICITACAO"));

    const [publicadosRow] = await db
      .select({ total: count() })
      .from(processos)
      .innerJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(and(eq(workflowProcesso.moduloAtual, "LICITACAO"), eq(processos.publicado, true)));

    const [aguardandoRow] = await db
      .select({ total: count() })
      .from(processos)
      .innerJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(and(eq(workflowProcesso.moduloAtual, "LICITACAO"), eq(processos.publicado, false)));

    const porStatusRows = await db
      .select({
        statusLicitacao: licitacoes.statusLicitacao,
        total: count(),
      })
      .from(licitacoes)
      .innerJoin(workflowProcesso, eq(workflowProcesso.processoId, licitacoes.processoId))
      .where(eq(workflowProcesso.moduloAtual, "LICITACAO"))
      .groupBy(licitacoes.statusLicitacao);

    const [recursosPendentesRow] = await db
      .select({ total: count() })
      .from(recursosLicitacao)
      .where(eq(recursosLicitacao.resultado, "PENDENTE"));

    return {
      total: Number(totalRow?.total ?? 0),
      publicados: Number(publicadosRow?.total ?? 0),
      aguardandoPublicacao: Number(aguardandoRow?.total ?? 0),
      recursosPendentes: Number(recursosPendentesRow?.total ?? 0),
      porStatus: porStatusRows.map((row) => ({
        statusLicitacao: row.statusLicitacao,
        total: Number(row.total),
      })),
    };
  }),

  list: publicProcedure.input(licitacaoListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [eq(workflowProcesso.moduloAtual, "LICITACAO")];

    if (input.statusLicitacao) {
      filters.push(eq(licitacoes.statusLicitacao, input.statusLicitacao));
    }
    if (typeof input.publicado === "boolean") {
      filters.push(eq(processos.publicado, input.publicado));
    }
    if (input.search) {
      filters.push(
        or(
          ilike(processos.numeroSirel, `%${input.search}%`),
          ilike(processos.objeto, `%${input.search}%`),
          ilike(secretarias.nome, `%${input.search}%`),
          ilike(modalidades.nome, `%${input.search}%`),
        ),
      );
    }

    const whereClause = and(...filters);

    const items = await db
      .select({
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroEdital: processos.numeroEdital,
        secretaria: secretarias.nome,
        modalidade: modalidades.nome,
        modalidadeCodigo: modalidades.codigo,
        etapaAtual: workflowProcesso.etapaAtual,
        situacaoWorkflow: workflowProcesso.situacao,
        atualizadoEm: workflowProcesso.atualizadoEm,
        statusLicitacao: licitacoes.statusLicitacao,
        publicado: processos.publicado,
        criterioJulgamento: processos.criterioJulgamento,
        modoDisputa: processos.modoDisputa,
        condutorNome: pessoas.nome,
      })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(licitacoes, eq(licitacoes.processoId, processos.id))
      .leftJoin(pessoas, eq(pessoas.id, processos.condutorProcessoId))
      .where(whereClause)
      .orderBy(desc(workflowProcesso.atualizadoEm), asc(processos.numeroSirel))
      .limit(input.pageSize)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(licitacoes, eq(licitacoes.processoId, processos.id))
      .where(whereClause);

    return {
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total ?? 0),
      items: items.map((item) => ({
        ...item,
        statusLicitacao: item.statusLicitacao ?? "PREPARACAO",
        suportaLances: supportsLances(item.modalidadeCodigo),
      })),
    };
  }),

  detail: publicProcedure.input(licitacaoDetailInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const processo = await getBaseProcesso(db, input.processoId);
    const [workflow] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);

    let licitacao = await db.select().from(licitacoes).where(eq(licitacoes.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null);
    if (!licitacao && workflow?.moduloAtual === "LICITACAO") {
      licitacao = await ensureLicitacao(db, input.processoId);
    }

    const itens = await db
      .select({
        id: itensProcesso.id,
        numeroItem: itensProcesso.numeroItem,
        descricao: itensProcesso.descricao,
        quantidade: itensProcesso.quantidade,
        unidade: itensProcesso.unidade,
        valorUnitarioEstimado: itensProcesso.valorUnitarioEstimado,
        valorTotalEstimado: itensProcesso.valorTotalEstimado,
      })
      .from(itensProcesso)
      .where(eq(itensProcesso.processoId, input.processoId))
      .orderBy(asc(itensProcesso.numeroItem));

    const licitantesRows = licitacao
      ? await db
          .select({
            id: licitantes.id,
            fornecedorId: fornecedores.id,
            razaoSocial: fornecedores.razaoSocial,
            cnpj: fornecedores.cnpj,
            statusHabilitacao: licitantes.statusHabilitacao,
            observacaoHabilitacao: licitantes.observacaoHabilitacao,
            dataCadastro: licitantes.dataCadastro,
            ativo: licitantes.ativo,
          })
          .from(licitantes)
          .innerJoin(fornecedores, eq(fornecedores.id, licitantes.fornecedorId))
          .where(eq(licitantes.licitacaoId, licitacao.id))
          .orderBy(asc(fornecedores.razaoSocial))
      : [];

    const propostasRows = licitacao
      ? await db
          .select({
            id: propostasLicitacao.id,
            licitanteId: propostasLicitacao.licitanteId,
            itemId: propostasLicitacao.itemId,
            valorUnitarioProposto: propostasLicitacao.valorUnitarioProposto,
            valorTotalProposto: propostasLicitacao.valorTotalProposto,
            dataProposta: propostasLicitacao.dataProposta,
            classificacao: propostasLicitacao.classificacao,
            situacao: propostasLicitacao.situacao,
            justificativa: propostasLicitacao.justificativa,
            licitanteNome: fornecedores.razaoSocial,
            itemDescricao: itensProcesso.descricao,
            itemNumero: itensProcesso.numeroItem,
            quantidadeItem: itensProcesso.quantidade,
            unidadeItem: itensProcesso.unidade,
          })
          .from(propostasLicitacao)
          .innerJoin(licitantes, eq(licitantes.id, propostasLicitacao.licitanteId))
          .innerJoin(fornecedores, eq(fornecedores.id, licitantes.fornecedorId))
          .innerJoin(itensProcesso, eq(itensProcesso.id, propostasLicitacao.itemId))
          .where(eq(licitantes.licitacaoId, licitacao.id))
          .orderBy(asc(itensProcesso.numeroItem), asc(propostasLicitacao.classificacao), asc(fornecedores.razaoSocial))
      : [];

    const proposalIds = propostasRows.map((row) => row.id);
    const lancesRows = proposalIds.length
      ? await db
          .select({
            id: lancesLicitacao.id,
            propostaId: lancesLicitacao.propostaId,
            valorLance: lancesLicitacao.valorLance,
            dataLance: lancesLicitacao.dataLance,
            usuarioId: lancesLicitacao.usuarioId,
            usuarioNome: users.name,
            observacao: lancesLicitacao.observacao,
          })
          .from(lancesLicitacao)
          .leftJoin(users, eq(users.id, lancesLicitacao.usuarioId))
          .where(inArray(lancesLicitacao.propostaId, proposalIds))
          .orderBy(desc(lancesLicitacao.dataLance), desc(lancesLicitacao.id))
      : [];

    const latestLanceMap = new Map<number, (typeof lancesRows)[number]>();
    lancesRows.forEach((row) => {
      if (!latestLanceMap.has(row.propostaId)) {
        latestLanceMap.set(row.propostaId, row);
      }
    });

    const recursosRows = licitacao
      ? await db
          .select({
            id: recursosLicitacao.id,
            licitanteId: recursosLicitacao.licitanteId,
            dataInterposicao: recursosLicitacao.dataInterposicao,
            dataJulgamento: recursosLicitacao.dataJulgamento,
            resultado: recursosLicitacao.resultado,
            descricao: recursosLicitacao.descricao,
            decisao: recursosLicitacao.decisao,
            licitanteNome: fornecedores.razaoSocial,
          })
          .from(recursosLicitacao)
          .innerJoin(licitantes, eq(licitantes.id, recursosLicitacao.licitanteId))
          .innerJoin(fornecedores, eq(fornecedores.id, licitantes.fornecedorId))
          .where(eq(recursosLicitacao.licitacaoId, licitacao.id))
          .orderBy(desc(recursosLicitacao.dataInterposicao), desc(recursosLicitacao.id))
      : [];

    const [condutor] = processo.condutorProcessoId
      ? await db
          .select({ id: pessoas.id, nome: pessoas.nome, cargo: pessoas.cargo })
          .from(pessoas)
          .where(eq(pessoas.id, processo.condutorProcessoId))
          .limit(1)
      : [];

    const historico = await db
      .select({
        id: movimentacoesWorkflow.id,
        descricao: movimentacoesWorkflow.descricao,
        observacao: movimentacoesWorkflow.observacao,
        criadoEm: movimentacoesWorkflow.criadoEm,
      })
      .from(movimentacoesWorkflow)
      .where(eq(movimentacoesWorkflow.processoId, input.processoId))
      .orderBy(desc(movimentacoesWorkflow.criadoEm))
      .limit(12);

    const docs = await db
      .select({
        id: documentos.id,
        titulo: documentos.titulo,
        tipo: documentos.tipo,
        categoria: documentos.categoria,
        versao: documentos.versao,
        arquivoUrl: documentos.arquivoUrl,
        criadoEm: documentos.criadoEm,
      })
      .from(documentos)
      .where(eq(documentos.processoId, input.processoId))
      .orderBy(desc(documentos.criadoEm))
      .limit(12);

    return {
      processo: {
        ...processo,
        condutorProcesso: condutor ?? null,
        suportaLances: supportsLances(processo.modalidadeCodigo),
      },
      workflow: workflow ?? null,
      licitacao: licitacao
        ? {
            ...licitacao,
            statusLicitacao: licitacao.statusLicitacao ?? "PREPARACAO",
          }
        : {
            processoId: input.processoId,
            statusLicitacao: "PREPARACAO" as LicitacaoStatus,
            exigeDeclaracaoNaoFracionamento: false,
            publicarNoDou: false,
            publicarEmJornal: false,
            dataPublicacaoEdital: null,
            dataRecebimentoPropostasInicio: null,
            dataRecebimentoPropostasFim: null,
            dataAberturaPropostas: null,
            dataInicioLances: null,
            dataFimLances: null,
            dataJulgamento: null,
            dataHomologacao: null,
            inversaoFasesHabilitada: false,
            inversaoFasesJustificativa: null,
            observacoes: null,
          },
      itens,
      licitantes: licitantesRows,
      propostas: propostasRows.map((row) => {
        const latestLance = latestLanceMap.get(row.id) ?? null;
        const valorAtualUnitario = Number(latestLance?.valorLance ?? row.valorUnitarioProposto ?? 0);
        const quantidade = Number(row.quantidadeItem ?? 0);
        return {
          ...row,
          latestLance,
          valorAtualUnitario,
          valorAtualTotal: valorAtualUnitario * quantidade,
        };
      }),
      lances: lancesRows,
      recursos: recursosRows,
      historico,
      documentos: docs.map((item) => ({ ...item, arquivoUrl: buildDocumentoUrl(item.id) })),
      checklistInterno: await buildInternalChecklist(
        db,
        input.processoId,
        Boolean(licitacao?.exigeDeclaracaoNaoFracionamento),
        processo.modalidadeCodigo,
        processo.modoDisputa,
      ),
      calendarioPublicacao: processo.foraDoFluxo
        ? buildManualSchedule({
            dataPublicacaoEdital: licitacao?.dataPublicacaoEdital ?? null,
            dataRecebimentoPropostasInicio: licitacao?.dataRecebimentoPropostasInicio ?? null,
            dataRecebimentoPropostasFim: licitacao?.dataRecebimentoPropostasFim ?? null,
            dataAberturaPropostas: licitacao?.dataAberturaPropostas ?? null,
          })
        : await buildPublicationSchedule(db, {
            modalidadeCodigo: processo.modalidadeCodigo,
            tipoObjeto: processo.tipoObjeto,
            dataPublicacaoEdital: licitacao?.dataPublicacaoEdital ?? null,
            publicarNoDou: licitacao?.publicarNoDou ?? false,
            publicarEmJornal: licitacao?.publicarEmJornal ?? false,
            dataAberturaPropostas: licitacao?.dataAberturaPropostas ?? null,
          }),
      resumo: {
        totalItens: itens.length,
        totalLicitantes: licitantesRows.length,
        totalPropostas: propostasRows.length,
        totalLances: lancesRows.length,
        totalRecursos: recursosRows.length,
      },
    };
  }),

  saveConfiguracao: operadorProcedure.input(licitacaoSaveConfiguracaoInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const processo = await getBaseProcesso(db, input.processoId);
    if (!processo.modalidadeId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Defina a modalidade do processo antes de configurar a Licitação." });
    }

    const licitacao = await ensureLicitacao(db, input.processoId);
    const justificativaAuditoria = toNullableText(input.justificativaAuditoria);
    if (processo.foraDoFluxo && !justificativaAuditoria) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa de auditoria para alterar processos fora do fluxo." });
    }


    const inversaoFasesHabilitada = Boolean(input.inversaoFasesHabilitada);
    const inversaoFasesJustificativa = inversaoFasesHabilitada ? toNullableText(input.inversaoFasesJustificativa) : null;
    if (inversaoFasesHabilitada && !inversaoFasesJustificativa) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa para a inversão de fases." });
    }

    const configuredPublicationDate = parseOptionalTimestamp(input.dataPublicacaoEdital);
    const configuredDisputeDate = parseOptionalTimestamp(input.dataAberturaPropostas);
    const manualSchedule = processo.foraDoFluxo
      ? buildManualSchedule({
          dataPublicacaoEdital: configuredPublicationDate,
          dataRecebimentoPropostasInicio: input.dataRecebimentoPropostasInicio,
          dataRecebimentoPropostasFim: input.dataRecebimentoPropostasFim,
          dataAberturaPropostas: input.dataAberturaPropostas,
        })
      : null;
    const schedule = processo.foraDoFluxo
      ? manualSchedule
      : await buildPublicationSchedule(db, {
          modalidadeCodigo: processo.modalidadeCodigo,
          tipoObjeto: processo.tipoObjeto,
          dataPublicacaoEdital: configuredPublicationDate,
          publicarNoDou: input.publicarNoDou,
          publicarEmJornal: input.publicarEmJornal,
          dataAberturaPropostas: configuredDisputeDate,
        });
    const patch = {
      exigeDeclaracaoNaoFracionamento: Boolean(input.exigeDeclaracaoNaoFracionamento),
      publicarNoDou: Boolean(input.publicarNoDou),
      publicarEmJornal: Boolean(input.publicarEmJornal),
      dataPublicacaoEdital: schedule?.dataPublicacaoEdital ?? configuredPublicationDate,
      dataRecebimentoPropostasInicio: schedule?.dataRecebimentoPropostasInicio ?? parseOptionalTimestamp(input.dataRecebimentoPropostasInicio),
      dataRecebimentoPropostasFim: schedule?.dataRecebimentoPropostasFim ?? parseOptionalTimestamp(input.dataRecebimentoPropostasFim),
      dataAberturaPropostas: schedule?.dataAberturaPropostas ?? parseOptionalTimestamp(input.dataAberturaPropostas),
      dataInicioLances: parseOptionalTimestamp(input.dataInicioLances),
      dataFimLances: parseOptionalTimestamp(input.dataFimLances),
      dataJulgamento: parseOptionalTimestamp(input.dataJulgamento),
      inversaoFasesHabilitada,
      inversaoFasesJustificativa,
      observacoes: toNullableText(input.observacoes),
      atualizadoEm: new Date(),
    };
    const processoPatch = {
      criterioJulgamento: toNullableText(input.criterioJulgamento),
      modoDisputa: toNullableText(input.modoDisputa),
      atualizadoEm: new Date(),
    };

    await db.update(licitacoes).set(patch).where(eq(licitacoes.id, licitacao.id));
    await db.update(processos).set(processoPatch).where(eq(processos.id, input.processoId));
    await syncWorkflowStep(db, input.processoId, "Licitação / preparação interna e publicidade");
    await syncPublicationDeadlines(db, input.processoId, schedule, ctx.user?.id ?? null);
    await appendMovement(db, {
      processoId: input.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: "Configuração da Licitação atualizada",
      observacao: [toNullableText(input.observacoes), processo.foraDoFluxo ? justificativaAuditoria : null].filter(Boolean).join(" | ") || null,
    });

    await logAuditoria(ctx, {
      tabela: "licitacoes",
      registroId: licitacao.id,
      acao: "UPDATE",
      dadosAnteriores: licitacao,
      dadosNovos: patch,
      descricao: `Configuração da licitação do processo ${processo.numeroSirel} atualizada`,
    });

    if (processo.foraDoFluxo) {
      const licitacaoAfter = { ...licitacao, ...patch };
      const processoAfter = { ...processo, ...processoPatch };
      await logAuditoriaDetalhada(ctx, {
        tabela: "licitacoes",
        registroId: licitacao.id,
        changes: buildAuditChanges(licitacao, licitacaoAfter, [
          { key: "exigeDeclaracaoNaoFracionamento", label: "Exigir declaração de não fracionamento" },
          { key: "publicarNoDou", label: "Publicação no DOU" },
          { key: "publicarEmJornal", label: "Publicação em jornal" },
          { key: "dataPublicacaoEdital", label: "Data de publicação do edital" },
          { key: "dataRecebimentoPropostasInicio", label: "Recebimento de propostas (in?cio)" },
          { key: "dataRecebimentoPropostasFim", label: "Recebimento de propostas (fim)" },
          { key: "dataAberturaPropostas", label: "Abertura de propostas" },
          { key: "dataInicioLances", label: "In?cio dos lances" },
          { key: "dataFimLances", label: "Fim dos lances" },
          { key: "dataJulgamento", label: "Data de julgamento" },
          { key: "inversaoFasesHabilitada", label: "Invers?o de fases habilitada" },
          { key: "inversaoFasesJustificativa", label: "Justificativa de invers?o de fases" },
          { key: "observacoes", label: "Observações internas" },
        ]),
        justificativa: justificativaAuditoria,
        prefixo: "Configuração fora do fluxo",
      });
      await logAuditoriaDetalhada(ctx, {
        tabela: "processos",
        registroId: input.processoId,
        changes: buildAuditChanges(processo, processoAfter, [
          { key: "criterioJulgamento", label: "Crit?rio de julgamento" },
          { key: "modoDisputa", label: "Modo de disputa" },
        ]),
        justificativa: justificativaAuditoria,
        prefixo: "Configuração fora do fluxo",
      });
    }

    return { success: true };
  }),

  setChecklistNaoAplicavel: operadorProcedure
    .input(licitacaoChecklistNaoAplicavelInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const processo = await getBaseProcesso(db, input.processoId);
      if (!processo.foraDoFluxo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A marcação de não aplicável só está disponível para processos fora do fluxo." });
      }

      const justificativaAuditoria = toNullableText(input.justificativaAuditoria);
      if (!justificativaAuditoria) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa de auditoria para atualizar o checklist fora do fluxo." });
      }

      const categoria = input.categoria.trim();
      const naoAplicavel = Boolean(input.naoAplicavel);
      const justificativa = naoAplicavel ? toNullableText(input.justificativa) : null;
      if (naoAplicavel && !justificativa) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa para marcar o item como não aplicável." });
      }

      const [existing] = await db
        .select()
        .from(licitacaoChecklistExcecoes)
        .where(and(eq(licitacaoChecklistExcecoes.processoId, input.processoId), eq(licitacaoChecklistExcecoes.categoria, categoria)))
        .limit(1);

      const now = new Date();
      let registroId = existing?.id ?? null;

      if (existing) {
        await db
          .update(licitacaoChecklistExcecoes)
          .set({
            naoAplicavel,
            justificativa,
            atualizadoEm: now,
          })
          .where(eq(licitacaoChecklistExcecoes.id, existing.id));
      } else {
        const [inserted] = await db
          .insert(licitacaoChecklistExcecoes)
          .values({
            processoId: input.processoId,
            categoria,
            naoAplicavel,
            justificativa,
            criadoEm: now,
            atualizadoEm: now,
          })
          .returning({ id: licitacaoChecklistExcecoes.id });
        registroId = inserted?.id ?? null;
      }

      const previousSnapshot = {
        naoAplicavel: existing?.naoAplicavel ?? false,
        justificativa: existing?.justificativa ?? null,
      };
      const nextSnapshot = {
        naoAplicavel,
        justificativa,
      };

      if (registroId) {
        const logJustificativa = [justificativaAuditoria, justificativa].filter(Boolean).join(" | ") || undefined;
        await logAuditoriaDetalhada(ctx, {
          tabela: "licitacao_checklist_excecoes",
          registroId,
          changes: buildAuditChanges(previousSnapshot, nextSnapshot, [
            { key: "naoAplicavel", label: "Item marcado como não aplicável" },
            { key: "justificativa", label: "Justificativa do item não aplicável" },
          ]),
          justificativa: logJustificativa,
          prefixo: "Checklist fora do fluxo",
        });
      }

      return { success: true };
    }),

  publish: operadorProcedure.input(licitacaoPublishInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const processo = await getBaseProcesso(db, input.processoId);
    if (!processo.modalidadeId || !processo.modalidadeCodigo) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Defina a modalidade antes de publicar o processo." });
    }

    const [workflow] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);
    if (workflow?.moduloAtual !== "LICITACAO") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A publicação só pode ocorrer para processos em Licitação." });
    }

    const licitacao = await ensureLicitacao(db, input.processoId);
    const justificativaAuditoria = toNullableText(input.justificativaAuditoria);
    if (processo.foraDoFluxo && !justificativaAuditoria) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa de auditoria para publicar processos fora do fluxo." });
    }

    const checklist = await buildInternalChecklist(
      db,
      input.processoId,
      Boolean(licitacao.exigeDeclaracaoNaoFracionamento),
      processo.modalidadeCodigo,
      processo.modoDisputa,
    );
    if (!processo.foraDoFluxo && checklist.obrigatoriosPendentes.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Conclua todos os documentos obrigatórios da fase interna antes de publicar o processo.",
      });
    }

    const manualSchedule = processo.foraDoFluxo
      ? buildManualSchedule({
          dataPublicacaoEdital: input.dataPublicacaoEdital ?? licitacao.dataPublicacaoEdital,
          dataRecebimentoPropostasInicio: input.dataRecebimentoPropostasInicio ?? licitacao.dataRecebimentoPropostasInicio,
          dataRecebimentoPropostasFim: input.dataRecebimentoPropostasFim ?? licitacao.dataRecebimentoPropostasFim,
          dataAberturaPropostas: input.dataAberturaPropostas ?? licitacao.dataAberturaPropostas,
        })
      : null;
    const schedule = processo.foraDoFluxo
      ? manualSchedule
      : await buildPublicationSchedule(db, {
          modalidadeCodigo: processo.modalidadeCodigo,
          tipoObjeto: processo.tipoObjeto,
          dataPublicacaoEdital: parseOptionalTimestamp(input.dataPublicacaoEdital) ?? licitacao.dataPublicacaoEdital ?? new Date(),
          publicarNoDou: licitacao.publicarNoDou,
          publicarEmJornal: licitacao.publicarEmJornal,
          dataAberturaPropostas: parseOptionalTimestamp(input.dataAberturaPropostas) ?? licitacao.dataAberturaPropostas ?? null,
        });
    if (!schedule) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: processo.foraDoFluxo
          ? "Informe as datas manuais de publicação, recebimento e abertura para concluir a publicação fora do fluxo."
          : "Informe a data prevista de publicação para gerar o cronograma automático.",
      });
    }

    const dataPublicacaoEdital = schedule.dataPublicacaoEdital ?? parseOptionalTimestamp(input.dataPublicacaoEdital) ?? licitacao.dataPublicacaoEdital ?? new Date();
    const dataRecebimentoPropostasInicio = schedule.dataRecebimentoPropostasInicio ?? parseOptionalTimestamp(input.dataRecebimentoPropostasInicio) ?? licitacao.dataRecebimentoPropostasInicio ?? null;
    const dataRecebimentoPropostasFim = schedule.dataRecebimentoPropostasFim ?? parseOptionalTimestamp(input.dataRecebimentoPropostasFim) ?? licitacao.dataRecebimentoPropostasFim ?? null;
    const dataAberturaPropostas = schedule.dataAberturaPropostas ?? parseOptionalTimestamp(input.dataAberturaPropostas) ?? licitacao.dataAberturaPropostas ?? null;

    const numeroEdital = processo.numeroEdital ?? await getNextNumeroEdital(db, processo.anoReferencia, processo.modalidadeCodigo);
    const licitacaoPatch = {
      statusLicitacao: "RECEBIMENTO_PROPOSTAS" as LicitacaoStatus,
      dataPublicacaoEdital,
      dataRecebimentoPropostasInicio,
      dataRecebimentoPropostasFim,
      dataAberturaPropostas,
      dataInicioLances: parseOptionalTimestamp(input.dataInicioLances) ?? licitacao.dataInicioLances ?? null,
      dataFimLances: parseOptionalTimestamp(input.dataFimLances) ?? licitacao.dataFimLances ?? null,
      atualizadoEm: new Date(),
    };


    await db.update(licitacoes).set(licitacaoPatch).where(eq(licitacoes.id, licitacao.id));
    await db.update(processos).set({
      numeroEdital,
      condutorProcessoId: input.condutorProcessoId,
      publicado: true,
      statusId: input.statusId ?? processo.statusId,
      atualizadoEm: new Date(),
    }).where(eq(processos.id, input.processoId));
    await syncWorkflowStep(db, input.processoId, "Divulgação / edital publicado");
    await syncPublicationDeadlines(db, input.processoId, schedule, ctx.user?.id ?? null);
    await appendMovement(db, {
      processoId: input.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: input.descricao?.trim() || `Processo publicado com edital ${numeroEdital}`,
      observacao: [toNullableText(input.observacao), processo.foraDoFluxo ? justificativaAuditoria : null].filter(Boolean).join(" | ") || null,
    });

    await logAuditoria(ctx, {
      tabela: "processos",
      registroId: input.processoId,
      acao: "UPDATE",
      dadosAnteriores: processo,
      dadosNovos: {
        numeroEdital,
        condutorProcessoId: input.condutorProcessoId,
        publicado: true,
        dataRecebimentoPropostasFim,
        dataAberturaPropostas,
      },
      descricao: `Processo ${processo.numeroSirel} publicado na fase de licitação`,
    });

    if (processo.foraDoFluxo) {
      const licitacaoAfter = { ...licitacao, ...licitacaoPatch };
      const processoAfter = {
        ...processo,
        numeroEdital,
        condutorProcessoId: input.condutorProcessoId,
        publicado: true,
        statusId: input.statusId ?? processo.statusId,
      };
      await logAuditoriaDetalhada(ctx, {
        tabela: "licitacoes",
        registroId: licitacao.id,
        changes: buildAuditChanges(licitacao, licitacaoAfter, [
          { key: "statusLicitacao", label: "Status da licitação" },
          { key: "dataPublicacaoEdital", label: "Data de publicação do edital" },
          { key: "dataRecebimentoPropostasInicio", label: "Recebimento de propostas (in?cio)" },
          { key: "dataRecebimentoPropostasFim", label: "Recebimento de propostas (fim)" },
          { key: "dataAberturaPropostas", label: "Abertura de propostas" },
          { key: "dataInicioLances", label: "In?cio dos lances" },
          { key: "dataFimLances", label: "Fim dos lances" },
        ]),
        justificativa: justificativaAuditoria,
        prefixo: "Publicação fora do fluxo",
      });
      await logAuditoriaDetalhada(ctx, {
        tabela: "processos",
        registroId: input.processoId,
        changes: buildAuditChanges(processo, processoAfter, [
          { key: "numeroEdital", label: "N?mero do edital" },
          { key: "condutorProcessoId", label: "Condutor do processo" },
          { key: "publicado", label: "Processo publicado" },
          { key: "statusId", label: "Status do processo" },
        ]),
        justificativa: justificativaAuditoria,
        prefixo: "Publicação fora do fluxo",
      });
    }

    return {
      success: true,
      numeroEdital,
      calendarioPublicacao: schedule,
    };
  }),

  saveLicitante: operadorProcedure.input(licitacaoSaveLicitanteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const processo = await getBaseProcesso(db, input.processoId);
    const licitacao = await ensureLicitacao(db, input.processoId);
    const [fornecedor] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.fornecedorId)).limit(1);
    if (!fornecedor) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
    }

    const [existing] = await db
      .select()
      .from(licitantes)
      .where(and(eq(licitantes.licitacaoId, licitacao.id), eq(licitantes.fornecedorId, input.fornecedorId)))
      .limit(1);

    if (existing) {
      await db.update(licitantes).set({ ativo: true, atualizadoEm: new Date() }).where(eq(licitantes.id, existing.id));
      return { success: true, licitanteId: existing.id };
    }

    const [created] = await db.insert(licitantes).values({
      licitacaoId: licitacao.id,
      fornecedorId: input.fornecedorId,
      dataCadastro: new Date(),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }).returning();

    await appendMovement(db, {
      processoId: input.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: `Licitante ${fornecedor.razaoSocial} registrado`,
    });
    await logAuditoria(ctx, {
      tabela: "licitantes",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Licitante adicionado ao processo ${processo.numeroSirel}`,
    });

    return { success: true, licitanteId: created.id };
  }),

  createFornecedorQuick: operadorProcedure.input(licitacaoQuickFornecedorInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const cnpjDigits = normalizeDigits(input.cnpj);
    if (cnpjDigits.length !== 14) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CNPJ válido com 14 dígitos." });
    }

    const cnpj = formatCnpj(cnpjDigits);
    const [existing] = await db
      .select()
      .from(fornecedores)
      .where(or(eq(fornecedores.cnpj, cnpj), eq(fornecedores.cnpj, cnpjDigits)))
      .limit(1);

    const patch = {
      razaoSocial: input.razaoSocial.trim(),
      cnpj,
      email: toNullableText(input.email),
      telefone: toNullableText(input.telefone),
      cidade: toNullableText(input.cidade),
      estado: toNullableText(input.estado)?.slice(0, 2).toUpperCase() ?? null,
      ativo: true,
      atualizadoEm: new Date(),
    };

    if (existing) {
      await db.update(fornecedores).set(patch).where(eq(fornecedores.id, existing.id));
      await logAuditoria(ctx, {
        tabela: "fornecedores",
        registroId: existing.id,
        acao: "UPDATE",
        dadosAnteriores: existing,
        dadosNovos: patch,
        descricao: `Fornecedor ${patch.razaoSocial} atualizado por cadastro rápido na licitação`,
      });

      return {
        id: existing.id,
        razaoSocial: patch.razaoSocial,
        cnpj: patch.cnpj,
        criado: false,
        reativado: !existing.ativo,
      };
    }

    const [created] = await db.insert(fornecedores).values({
      ...patch,
      criadoEm: new Date(),
    }).returning();

    await logAuditoria(ctx, {
      tabela: "fornecedores",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Fornecedor ${created.razaoSocial} criado por cadastro rápido na licitação`,
    });

    return {
      id: created.id,
      razaoSocial: created.razaoSocial,
      cnpj: created.cnpj,
      criado: true,
      reativado: false,
    };
  }),

  deleteLicitante: operadorProcedure.input(licitacaoDeleteLicitanteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [licitante] = await db.select().from(licitantes).where(eq(licitantes.id, input.licitanteId)).limit(1);
    if (!licitante) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Licitante não encontrado." });
    }

    const [licitacao] = await db.select().from(licitacoes).where(eq(licitacoes.id, licitante.licitacaoId)).limit(1);
    const [fornecedor] = await db.select().from(fornecedores).where(eq(fornecedores.id, licitante.fornecedorId)).limit(1);
    if (!licitacao || !fornecedor) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível localizar os dados do licitante." });
    }

    await db.update(licitantes).set({
      ativo: false,
      atualizadoEm: new Date(),
    }).where(eq(licitantes.id, input.licitanteId));

    await appendMovement(db, {
      processoId: licitacao.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: `Licitante ${fornecedor.razaoSocial} retirado da disputa`,
    });
    await logAuditoria(ctx, {
      tabela: "licitantes",
      registroId: licitante.id,
      acao: "UPDATE",
      dadosAnteriores: licitante,
      dadosNovos: { ativo: false },
      descricao: `Licitante ${fornecedor.razaoSocial} inativado na licitação do processo ${licitacao.processoId}`,
    });

    return { success: true };
  }),

  saveProposta: operadorProcedure.input(licitacaoSavePropostaInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const processo = await getBaseProcesso(db, input.processoId);
    const licitacao = await ensureLicitacao(db, input.processoId);
    const [licitante] = await db.select().from(licitantes).where(eq(licitantes.id, input.licitanteId)).limit(1);
    if (!licitante || licitante.licitacaoId !== licitacao.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Licitante inválido para este processo." });
    }

    const [item] = await db.select().from(itensProcesso).where(eq(itensProcesso.id, input.itemId)).limit(1);
    if (!item || item.processoId !== input.processoId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Item inválido para este processo." });
    }

    const total = Number(input.valorUnitarioProposto) * Number(item.quantidade ?? 0);
    const patch = {
      licitanteId: input.licitanteId,
      itemId: input.itemId,
      valorUnitarioProposto: String(input.valorUnitarioProposto),
      valorTotalProposto: total.toFixed(2),
      dataProposta: parseOptionalTimestamp(input.dataProposta) ?? new Date(),
      classificacao: input.classificacao ?? null,
      situacao: input.situacao,
      justificativa: toNullableText(input.justificativa),
      atualizadoEm: new Date(),
    };

    if (input.propostaId) {
      const [existing] = await db.select().from(propostasLicitacao).where(eq(propostasLicitacao.id, input.propostaId)).limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
      }
      await db.update(propostasLicitacao).set(patch).where(eq(propostasLicitacao.id, input.propostaId));
      await logAuditoria(ctx, {
        tabela: "propostas_licitacao",
        registroId: input.propostaId,
        acao: "UPDATE",
        dadosAnteriores: existing,
        dadosNovos: patch,
        descricao: `Proposta atualizada no processo ${processo.numeroSirel}`,
      });
      return { success: true, propostaId: input.propostaId };
    }

    const [created] = await db.insert(propostasLicitacao).values({
      ...patch,
      criadoEm: new Date(),
    }).returning();

    await appendMovement(db, {
      processoId: input.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: `Proposta registrada para o item ${item.numeroItem}`,
    });
    await logAuditoria(ctx, {
      tabela: "propostas_licitacao",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Proposta criada no processo ${processo.numeroSirel}`,
    });
    return { success: true, propostaId: created.id };
  }),

  saveLance: operadorProcedure.input(licitacaoSaveLanceInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [proposta] = await db.select().from(propostasLicitacao).where(eq(propostasLicitacao.id, input.propostaId)).limit(1);
    if (!proposta) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
    }

    const [licitante] = await db.select().from(licitantes).where(eq(licitantes.id, proposta.licitanteId)).limit(1);
    if (!licitante) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Licitante da proposta não encontrado." });
    }

    const [licitacao] = await db.select().from(licitacoes).where(eq(licitacoes.id, licitante.licitacaoId)).limit(1);
    if (!licitacao) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Licitação da proposta não encontrada." });
    }

    const [created] = await db.insert(lancesLicitacao).values({
      propostaId: input.propostaId,
      valorLance: String(input.valorLance),
      dataLance: parseOptionalTimestamp(input.dataLance) ?? new Date(),
      usuarioId: ctx.user?.id ?? null,
      observacao: toNullableText(input.observacao),
    }).returning();

    await db.update(licitacoes).set({
      statusLicitacao: "LANCES",
      atualizadoEm: new Date(),
    }).where(eq(licitacoes.id, licitacao.id));
    await syncWorkflowStep(db, licitacao.processoId, "Licitação / fase de lances");
    await appendMovement(db, {
      processoId: licitacao.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: "Lance registrado na sessão pública",
      observacao: toNullableText(input.observacao),
    });
    await logAuditoria(ctx, {
      tabela: "lances_licitacao",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Lance registrado na licitação do processo ${licitacao.processoId}`,
    });

    return { success: true, lanceId: created.id };
  }),

  saveHabilitacao: operadorProcedure.input(licitacaoSaveHabilitacaoInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [licitante] = await db.select().from(licitantes).where(eq(licitantes.id, input.licitanteId)).limit(1);
    if (!licitante) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Licitante não encontrado." });
    }

    const [licitacao] = await db.select().from(licitacoes).where(eq(licitacoes.id, licitante.licitacaoId)).limit(1);
    if (!licitacao) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Licitação não encontrada para o licitante." });
    }

    await db.update(licitantes).set({
      statusHabilitacao: input.statusHabilitacao,
      observacaoHabilitacao: toNullableText(input.observacaoHabilitacao),
      atualizadoEm: new Date(),
    }).where(eq(licitantes.id, input.licitanteId));
    await db.update(licitacoes).set({
      statusLicitacao: "HABILITACAO",
      atualizadoEm: new Date(),
    }).where(eq(licitacoes.id, licitacao.id));
    await syncWorkflowStep(db, licitacao.processoId, "Licitação / habilitação");
    await appendMovement(db, {
      processoId: licitacao.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: `Habilitação atualizada: ${input.statusHabilitacao}`,
      observacao: toNullableText(input.observacaoHabilitacao),
    });

    return { success: true };
  }),

  saveRecurso: operadorProcedure.input(licitacaoSaveRecursoInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const licitacao = await ensureLicitacao(db, input.processoId);
    const [licitante] = await db.select().from(licitantes).where(eq(licitantes.id, input.licitanteId)).limit(1);
    if (!licitante || licitante.licitacaoId !== licitacao.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Licitante inválido para o recurso informado." });
    }

    const patch = {
      licitacaoId: licitacao.id,
      licitanteId: input.licitanteId,
      dataInterposicao: parseOptionalDate(input.dataInterposicao) ?? nowDateString(),
      dataJulgamento: parseOptionalDate(input.dataJulgamento),
      resultado: input.resultado,
      descricao: input.descricao.trim(),
      decisao: toNullableText(input.decisao),
      atualizadoEm: new Date(),
    };

    if (input.recursoId) {
      const [existing] = await db.select().from(recursosLicitacao).where(eq(recursosLicitacao.id, input.recursoId)).limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recurso não encontrado." });
      }
      await db.update(recursosLicitacao).set(patch).where(eq(recursosLicitacao.id, input.recursoId));
    } else {
      await db.insert(recursosLicitacao).values({
        ...patch,
        criadoPor: ctx.user?.id ?? null,
        criadoEm: new Date(),
      });
    }

    await db.update(licitacoes).set({
      statusLicitacao: "RECURSOS",
      atualizadoEm: new Date(),
    }).where(eq(licitacoes.id, licitacao.id));
    await syncWorkflowStep(db, input.processoId, "Licitação / fase recursal");
    await appendMovement(db, {
      processoId: input.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: "Recurso administrativo registrado",
      observacao: toNullableText(input.decisao) ?? input.descricao.trim(),
    });

    return { success: true };
  }),

  advanceStage: operadorProcedure.input(licitacaoAdvanceStageInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const processo = await getBaseProcesso(db, input.processoId);
    const justificativaAuditoria = toNullableText(input.justificativaAuditoria);
    if (processo.foraDoFluxo && !justificativaAuditoria) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa de auditoria para alterar o status fora do fluxo." });
    }

    const licitacao = await ensureLicitacao(db, input.processoId);
    await db.update(licitacoes).set({
      statusLicitacao: input.statusLicitacao,
      atualizadoEm: new Date(),
    }).where(eq(licitacoes.id, licitacao.id));
    await syncWorkflowStep(db, input.processoId, input.etapaAtual);
    await appendMovement(db, {
      processoId: input.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: `Etapa da Licitação alterada para ${input.etapaAtual}`,
      observacao: [toNullableText(input.observacao), processo.foraDoFluxo ? justificativaAuditoria : null].filter(Boolean).join(" | ") || null,
    });

    if (processo.foraDoFluxo) {
      await logAuditoriaDetalhada(ctx, {
        tabela: "licitacoes",
        registroId: licitacao.id,
        changes: buildAuditChanges(licitacao, { ...licitacao, statusLicitacao: input.statusLicitacao }, [
          { key: "statusLicitacao", label: "Status da licitação" },
        ]),
        justificativa: justificativaAuditoria,
        prefixo: "Alteração fora do fluxo",
      });
    }

    return { success: true };
  }),

  homologar: operadorProcedure.input(licitacaoHomologarInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const processo = await getBaseProcesso(db, input.processoId);
    const licitacao = await ensureLicitacao(db, input.processoId);
    const justificativaAuditoria = toNullableText(input.justificativaAuditoria);
    if (processo.foraDoFluxo && !justificativaAuditoria) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa de auditoria para homologar processos fora do fluxo." });
    }
    const dataHomologacao = parseOptionalDate(input.dataHomologacao);

    await db.update(licitacoes).set({
      statusLicitacao: "HOMOLOGACAO",
      dataHomologacao: dataHomologacao ? new Date(`${dataHomologacao}T12:00:00`) : new Date(),
      atualizadoEm: new Date(),
    }).where(eq(licitacoes.id, licitacao.id));
    await db.update(processos).set({
      homologado: true,
      statusId: input.statusId ?? processo.statusId,
      atualizadoEm: new Date(),
    }).where(eq(processos.id, input.processoId));
    await syncWorkflowStep(db, input.processoId, "Licitação / homologação concluída", "CONCLUIDO");
    await appendMovement(db, {
      processoId: input.processoId,
      usuarioId: ctx.user?.id ?? null,
      descricao: "Licitação homologada",
      observacao: [toNullableText(input.observacao), processo.foraDoFluxo ? justificativaAuditoria : null].filter(Boolean).join(" | ") || null,
    });
    await logAuditoria(ctx, {
      tabela: "processos",
      registroId: input.processoId,
      acao: "UPDATE",
      dadosAnteriores: processo,
      dadosNovos: { homologado: true },
      descricao: `Processo ${processo.numeroSirel} homologado`,
    });

    if (processo.foraDoFluxo) {
      const licitacaoAfter = { ...licitacao, statusLicitacao: "HOMOLOGACAO", dataHomologacao: dataHomologacao ? new Date(`${dataHomologacao}T12:00:00`) : new Date() };
      const processoAfter = { ...processo, homologado: true, statusId: input.statusId ?? processo.statusId };
      await logAuditoriaDetalhada(ctx, {
        tabela: "licitacoes",
        registroId: licitacao.id,
        changes: buildAuditChanges(licitacao, licitacaoAfter, [
          { key: "statusLicitacao", label: "Status da licitação" },
          { key: "dataHomologacao", label: "Data de homologação" },
        ]),
        justificativa: justificativaAuditoria,
        prefixo: "Homologação fora do fluxo",
      });
      await logAuditoriaDetalhada(ctx, {
        tabela: "processos",
        registroId: input.processoId,
        changes: buildAuditChanges(processo, processoAfter, [
          { key: "homologado", label: "Processo homologado" },
          { key: "statusId", label: "Status do processo" },
        ]),
        justificativa: justificativaAuditoria,
        prefixo: "Homologação fora do fluxo",
      });
    }

    return { success: true };
  }),
});
