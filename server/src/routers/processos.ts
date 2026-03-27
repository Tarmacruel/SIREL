import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";

import {
  processoCreateInputSchema,
  processoListInputSchema,
  processoSetAtivoInputSchema,
  processoUpdateDataInputSchema,
} from "@sirel/shared/schemas/processos";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  contratos,
  dfd,
  documentos,
  etp,
  etpCotacoesPreliminares,
  itensProcesso,
  modalidades,
  movimentacoesWorkflow,
  pessoas,
  processos,
  secretarias,
  statusProcesso,
  tr,
  workflowProcesso,
} from "../db/schema.js";
import { getNextNumeroSirel } from "../lib/processo-identity.js";
import { getSystemParamNumber } from "../lib/system-params.js";
import { gestorProcedure, publicProcedure, router } from "../trpc.js";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysSince(value: Date | string | null | undefined) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function isDispensaModalidade(modalidadeCodigo?: string | null) {
  return Boolean(modalidadeCodigo && modalidadeCodigo.includes("DISPENSA"));
}

function isObjetoIncisoI(tipoObjeto?: string | null) {
  return tipoObjeto === "OBRA" || tipoObjeto === "SERVICO_ENG";
}

function parseOptionalTimestamp(value?: string) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Data/hora inválida informada para o processo.",
    });
  }
  return parsed;
}

async function validateDispensaLimit(params: {
  db: ReturnType<typeof requireDb>;
  modalidadeId?: number | null;
  tipoObjeto?: string | null;
  valorEstimado?: number | null;
}) {
  if (!params.modalidadeId || params.valorEstimado === undefined || params.valorEstimado === null) {
    return;
  }

  const [modalidade] = await params.db
    .select({ codigo: modalidades.codigo, nome: modalidades.nome })
    .from(modalidades)
    .where(eq(modalidades.id, params.modalidadeId))
    .limit(1);

  if (!modalidade || !isDispensaModalidade(modalidade.codigo)) return;

  const isIncisoI = isObjetoIncisoI(params.tipoObjeto);
  const limite = isIncisoI
    ? await getSystemParamNumber(params.db, "LIMITES.DISPENSA.INCISO_I", 119217.89)
    : await getSystemParamNumber(params.db, "LIMITES.DISPENSA.INCISO_II", 59908.94);

  if (params.valorEstimado > limite) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Valor estimado excede o limite configurado para dispensa (${isIncisoI ? "Inciso I" : "Inciso II"}): R$ ${limite.toFixed(2)}.`,
    });
  }
}

async function loadProcessMaps(processIds: number[]) {
  const db = requireDb();
  if (!processIds.length) {
    return {
      documentos: new Map<number, number>(),
      contratos: new Map<number, { total: number; ativos: number }>(),
      itens: new Map<number, number>(),
      cotacoes: new Map<number, number>(),
      dfd: new Map<number, { concluido: boolean }>(),
      etp: new Map<number, { concluido: boolean }>(),
      tr: new Map<number, { concluido: boolean }>(),
      ultimasMovimentacoes: new Map<number, { descricao: string; moduloDestino: string; criadoEm: Date | null }>(),
    };
  }

  const [documentRows, contractRows, itemRows, cotacaoRows, dfdRows, etpRows, trRows, movementRows] = await Promise.all([
    db.select({ processoId: documentos.processoId, total: count() }).from(documentos).where(inArray(documentos.processoId, processIds)).groupBy(documentos.processoId),
    db.select({ processoId: contratos.processoId, status: contratos.status }).from(contratos).where(inArray(contratos.processoId, processIds)),
    db.select({ processoId: itensProcesso.processoId, total: count() }).from(itensProcesso).where(inArray(itensProcesso.processoId, processIds)).groupBy(itensProcesso.processoId),
    db
      .select({ processoId: itensProcesso.processoId, total: count() })
      .from(etpCotacoesPreliminares)
      .innerJoin(itensProcesso, eq(itensProcesso.id, etpCotacoesPreliminares.itemId))
      .where(inArray(itensProcesso.processoId, processIds))
      .groupBy(itensProcesso.processoId),
    db.select({ processoId: dfd.processoId, concluido: dfd.concluido }).from(dfd).where(inArray(dfd.processoId, processIds)),
    db.select({ processoId: etp.processoId, concluido: etp.concluido }).from(etp).where(inArray(etp.processoId, processIds)),
    db.select({ processoId: tr.processoId, concluido: tr.concluido }).from(tr).where(inArray(tr.processoId, processIds)),
    db
      .select({
        processoId: movimentacoesWorkflow.processoId,
        descricao: movimentacoesWorkflow.descricao,
        moduloDestino: movimentacoesWorkflow.moduloDestino,
        criadoEm: movimentacoesWorkflow.criadoEm,
      })
      .from(movimentacoesWorkflow)
      .where(inArray(movimentacoesWorkflow.processoId, processIds))
      .orderBy(desc(movimentacoesWorkflow.criadoEm)),
  ]);

  const documentosMap = new Map(documentRows.map((row) => [row.processoId, Number(row.total)]));
  const itensMap = new Map(itemRows.map((row) => [row.processoId, Number(row.total)]));
  const cotacoesMap = new Map(cotacaoRows.map((row) => [row.processoId, Number(row.total)]));
  const dfdMap = new Map(dfdRows.map((row) => [row.processoId, { concluido: row.concluido }]));
  const etpMap = new Map(etpRows.map((row) => [row.processoId, { concluido: row.concluido }]));
  const trMap = new Map(trRows.map((row) => [row.processoId, { concluido: row.concluido }]));

  const contratosMap = new Map<number, { total: number; ativos: number }>();
  for (const row of contractRows) {
    const current = contratosMap.get(row.processoId) ?? { total: 0, ativos: 0 };
    current.total += 1;
    if (row.status === "ATIVO") {
      current.ativos += 1;
    }
    contratosMap.set(row.processoId, current);
  }

  const movementMap = new Map<number, { descricao: string; moduloDestino: string; criadoEm: Date | null }>();
  for (const row of movementRows) {
    if (!movementMap.has(row.processoId)) {
      movementMap.set(row.processoId, {
        descricao: row.descricao,
        moduloDestino: row.moduloDestino,
        criadoEm: row.criadoEm,
      });
    }
  }

  return {
    documentos: documentosMap,
    contratos: contratosMap,
    itens: itensMap,
    cotacoes: cotacoesMap,
    dfd: dfdMap,
    etp: etpMap,
    tr: trMap,
    ultimasMovimentacoes: movementMap,
  };
}

export const processosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const rows = await db
      .select({
        id: processos.id,
        foraDoFluxo: processos.foraDoFluxo,
        ativo: processos.ativo,
        publicado: processos.publicado,
        homologado: processos.homologado,
        finalizado: processos.finalizado,
        moduloAtual: workflowProcesso.moduloAtual,
        atualizadoEm: workflowProcesso.atualizadoEm,
      })
      .from(processos)
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id));

    const porModulo = new Map<string, number>();
    let foraDoFluxo = 0;
    let ativos = 0;
    let inativos = 0;
    let publicados = 0;
    let homologados = 0;
    let finalizados = 0;
    let paradosHaMaisDeSeteDias = 0;
    let mediaDiasParado = 0;

    for (const row of rows) {
      const modulo = row.moduloAtual ?? "SEM_WORKFLOW";
      porModulo.set(modulo, (porModulo.get(modulo) ?? 0) + 1);
      if (row.foraDoFluxo) foraDoFluxo += 1;
      if (row.ativo) ativos += 1;
      else inativos += 1;
      if (row.publicado) publicados += 1;
      if (row.homologado) homologados += 1;
      if (row.finalizado) finalizados += 1;

      const diasParado = daysSince(row.atualizadoEm);
      mediaDiasParado += diasParado;
      if (diasParado >= 7 && !row.finalizado) {
        paradosHaMaisDeSeteDias += 1;
      }
    }

    return {
      total: rows.length,
      ativos,
      inativos,
      emFluxo: rows.length - foraDoFluxo,
      foraDoFluxo,
      publicados,
      homologados,
      finalizados,
      paradosHaMaisDeSeteDias,
      mediaDiasParado: rows.length ? Number((mediaDiasParado / rows.length).toFixed(1)) : 0,
      porModulo: Array.from(porModulo.entries()).map(([modulo, total]) => ({ modulo, total })),
    };
  }),

  list: publicProcedure.input(processoListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [];

    if (input.secretariaId) filters.push(eq(processos.secretariaId, input.secretariaId));
    if (input.statusId) filters.push(eq(processos.statusId, input.statusId));
    if (input.moduloAtual) filters.push(eq(workflowProcesso.moduloAtual, input.moduloAtual as never));
    if (input.situacao) filters.push(eq(workflowProcesso.situacao, input.situacao as never));
    if (typeof input.foraDoFluxo === "boolean") filters.push(eq(processos.foraDoFluxo, input.foraDoFluxo));
    if (typeof input.ativo === "boolean") filters.push(eq(processos.ativo, input.ativo));
    if (input.search) {
      filters.push(
        or(
          ilike(processos.numeroSirel, `%${input.search}%`),
          ilike(processos.numeroAdministrativo, `%${input.search}%`),
          ilike(processos.objeto, `%${input.search}%`),
          ilike(secretarias.nome, `%${input.search}%`),
          ilike(modalidades.nome, `%${input.search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroAdministrativo: processos.numeroAdministrativo,
        numeroEdital: processos.numeroEdital,
        secretaria: secretarias.nome,
        secretariaSigla: secretarias.sigla,
        modalidade: modalidades.nome,
        status: statusProcesso.nome,
        moduloAtual: workflowProcesso.moduloAtual,
        situacao: workflowProcesso.situacao,
        etapaAtual: workflowProcesso.etapaAtual,
        workflowAtualizadoEm: workflowProcesso.atualizadoEm,
        objeto: processos.objeto,
        valorEstimado: processos.valorEstimado,
        dataAbertura: processos.dataAbertura,
        dataPublicacao: processos.dataPublicacao,
        dataDisputaSessao: processos.dataDisputaSessao,
        foraDoFluxo: processos.foraDoFluxo,
        ativo: processos.ativo,
        publicado: processos.publicado,
        homologado: processos.homologado,
        finalizado: processos.finalizado,
        criadoEm: processos.criadoEm,
      })
      .from(processos)
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(whereClause)
      .orderBy(desc(processos.criadoEm), desc(processos.id));

    const maps = await loadProcessMaps(rows.map((row) => row.id));

    let items = rows.map((row) => {
      const diasParado = daysSince(row.workflowAtualizadoEm ?? row.criadoEm);
      const contratosRow = maps.contratos.get(row.id) ?? { total: 0, ativos: 0 };
      const ultimaMovimentacao = maps.ultimasMovimentacoes.get(row.id) ?? null;

      return {
        ...row,
        valorEstimado: row.valorEstimado ? toNumber(row.valorEstimado) : null,
        diasParado,
        documentos: maps.documentos.get(row.id) ?? 0,
        itens: maps.itens.get(row.id) ?? 0,
        cotacoesPreliminares: maps.cotacoes.get(row.id) ?? 0,
        contratos: contratosRow.total,
        contratosAtivos: contratosRow.ativos,
        ultimaMovimentacao,
      };
    });

    if (input.paradosHaMaisDeSeteDias) {
      items = items.filter((item) => item.diasParado >= 7 && !item.finalizado);
    }

    const total = items.length;
    const offset = (input.page - 1) * input.pageSize;
    items = items.slice(offset, offset + input.pageSize);

    return {
      page: input.page,
      pageSize: input.pageSize,
      total,
      items,
    };
  }),

  create: gestorProcedure.input(processoCreateInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    await validateDispensaLimit({
      db,
      modalidadeId: input.modalidadeId,
      tipoObjeto: input.tipoObjeto ?? "PRODUTO",
      valorEstimado: input.valorEstimado ?? null,
    });
    const dataPublicacao = parseOptionalTimestamp(input.dataPublicacao);
    const dataDisputaSessao = parseOptionalTimestamp(input.dataDisputaSessao);
    const numeroSirel = await getNextNumeroSirel(db, input.anoReferencia);
    const moduloInicial = input.foraDoFluxo ? input.moduloInicial ?? "DOCUMENTOS" : "PLANEJAMENTO";

    const [created] = await db
      .insert(processos)
      .values({
        numeroSirel,
        numeroAdministrativo: input.numeroAdministrativo,
        numeroEdital: input.numeroEdital ?? null,
        anoReferencia: input.anoReferencia,
        foraDoFluxo: input.foraDoFluxo,
        secretariaId: input.secretariaId,
        modalidadeId: input.modalidadeId,
        statusId: input.statusId,
        autoridadeCompetenteId: input.autoridadeCompetenteId,
        condutorProcessoId: input.condutorProcessoId ?? null,
        objeto: input.objeto,
        valorEstimado: input.valorEstimado?.toFixed(2),
        escopoDisputa: input.escopoDisputa ?? "GLOBAL",
        criterioJulgamento: input.criterioJulgamento,
        modoDisputa: input.modoDisputa ?? "NAO_SE_APLICA",
        tipoObjeto: input.tipoObjeto ?? "PRODUTO",
        tipoContratacao: input.tipoContratacao ?? "AQUISICAO",
        dataAbertura: input.dataAbertura,
        dataPublicacao,
        dataDisputaSessao,
        criadoPor: ctx.user?.id ?? null,
      })
      .returning();

    const situacaoInicial = input.situacao ?? "RASCUNHO";
    await db.insert(workflowProcesso).values({
      processoId: created.id,
      moduloAtual: moduloInicial,
      situacao: situacaoInicial,
      etapaAtual: input.foraDoFluxo ? "Cadastro inicial fora do fluxo" : "Cadastro inicial no planejamento",
      dataConclusao: situacaoInicial === "CONCLUIDO" ? new Date().toISOString().slice(0, 10) : null,
    });

    await db.insert(movimentacoesWorkflow).values({
      processoId: created.id,
      moduloOrigem: "SISTEMA",
      moduloDestino: moduloInicial,
      descricao: input.foraDoFluxo
        ? `Processo fora do fluxo criado em ${moduloInicial}`
        : "Processo criado no Planejamento",
      observacao: input.foraDoFluxo
        ? "Registro inicial marcado como processo fora do fluxo."
        : "Registro inicial do processo dentro do fluxo regular.",
      usuarioId: ctx.user?.id ?? null,
    });

    await logAuditoria(ctx, {
      tabela: "processos",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Processo ${created.numeroSirel} criado`,
    });

    return created;
  }),

  setAtivo: gestorProcedure.input(processoSetAtivoInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [before] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);

    if (!before) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado." });
    }

    const [updated] = await db
      .update(processos)
      .set({
        ativo: input.ativo,
        atualizadoEm: new Date(),
      })
      .where(eq(processos.id, input.processoId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "processos",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: before,
      dadosNovos: updated,
      descricao: `Processo ${updated.numeroSirel} ${input.ativo ? "reativado" : "inativado"}`,
    });

    return {
      id: updated.id,
      numeroSirel: updated.numeroSirel,
      ativo: updated.ativo,
    };
  }),

  updateData: gestorProcedure.input(processoUpdateDataInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [before] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);

    if (!before) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado." });
    }

    if (input.valorEstimado !== undefined) {
      await validateDispensaLimit({
        db,
        modalidadeId: before.modalidadeId,
        tipoObjeto: before.tipoObjeto,
        valorEstimado: input.valorEstimado,
      });
    }

    const updateData: any = {
      atualizadoEm: new Date(),
    };

    if (input.foraDoFluxo !== undefined) updateData.foraDoFluxo = input.foraDoFluxo;
    if (input.numeroAdministrativo !== undefined) updateData.numeroAdministrativo = input.numeroAdministrativo;
    if (input.numeroEdital !== undefined) updateData.numeroEdital = input.numeroEdital;
    if (input.dataAbertura !== undefined) updateData.dataAbertura = input.dataAbertura;
    if (input.dataPublicacao !== undefined) updateData.dataPublicacao = parseOptionalTimestamp(input.dataPublicacao);
    if (input.dataDisputaSessao !== undefined) updateData.dataDisputaSessao = parseOptionalTimestamp(input.dataDisputaSessao);
    if (input.secretariaId !== undefined) updateData.secretariaId = input.secretariaId;
    if (input.modalidadeId !== undefined) updateData.modalidadeId = input.modalidadeId;
    if (input.tipoObjeto !== undefined) updateData.tipoObjeto = input.tipoObjeto;
    if (input.tipoContratacao !== undefined) updateData.tipoContratacao = input.tipoContratacao;
    if (input.autoridadeCompetenteId !== undefined) updateData.autoridadeCompetenteId = input.autoridadeCompetenteId;
    if (input.condutorProcessoId !== undefined) updateData.condutorProcessoId = input.condutorProcessoId;
    if (input.objeto !== undefined) updateData.objeto = input.objeto;
    if (input.valorEstimado !== undefined) updateData.valorEstimado = input.valorEstimado.toFixed(2);
    if (input.criterioJulgamento !== undefined) updateData.criterioJulgamento = input.criterioJulgamento;
    if (input.modoDisputa !== undefined) updateData.modoDisputa = input.modoDisputa;
    if (input.escopoDisputa !== undefined) updateData.escopoDisputa = input.escopoDisputa;

    const [updated] = await db
      .update(processos)
      .set(updateData)
      .where(eq(processos.id, input.processoId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "processos",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: before,
      dadosNovos: updated,
      descricao: `Processo ${updated.numeroSirel} atualizado - Dados do processo editados via workflow`,
    });

    if (input.situacao !== undefined) {
      await db
        .update(workflowProcesso)
        .set({
          situacao: input.situacao,
          dataConclusao: input.situacao === "CONCLUIDO" ? new Date().toISOString().slice(0, 10) : null,
          atualizadoEm: new Date(),
        })
        .where(eq(workflowProcesso.processoId, input.processoId));
    }

    return updated;
  }),

  timeline: publicProcedure.input(z.object({ numeroSirel: z.string().min(1) })).query(async ({ input }) => {
    const db = requireDb();
    return db
      .select({
        numeroSirel: processos.numeroSirel,
        moduloOrigem: movimentacoesWorkflow.moduloOrigem,
        moduloDestino: movimentacoesWorkflow.moduloDestino,
        descricao: movimentacoesWorkflow.descricao,
        observacao: movimentacoesWorkflow.observacao,
        criadoEm: movimentacoesWorkflow.criadoEm,
      })
      .from(movimentacoesWorkflow)
      .innerJoin(processos, eq(processos.id, movimentacoesWorkflow.processoId))
      .where(eq(processos.numeroSirel, input.numeroSirel))
      .orderBy(desc(movimentacoesWorkflow.criadoEm));
  }),

  overview: publicProcedure.input(z.object({ processoId: z.number().int().positive() })).query(async ({ input }) => {
    const db = requireDb();
    const [baseRow] = await db
      .select({
        processo: processos,
        workflow: workflowProcesso,
        secretaria: secretarias,
        modalidade: modalidades,
        status: statusProcesso,
      })
      .from(processos)
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
      .where(eq(processos.id, input.processoId))
      .limit(1);

    if (!baseRow) {
      return null;
    }

    const peopleIds = [baseRow.processo.autoridadeCompetenteId, baseRow.processo.condutorProcessoId].filter(
      (value): value is number => Boolean(value),
    );

    const [docRow, itemRow, dfdRow, etpRow, trRow, contratosRows, peopleRows, cotacaoRow] = await Promise.all([
      db.select({ total: count() }).from(documentos).where(eq(documentos.processoId, input.processoId)).then((rows) => rows[0]),
      db.select({ total: count() }).from(itensProcesso).where(eq(itensProcesso.processoId, input.processoId)).then((rows) => rows[0]),
      db.select().from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(etp).where(eq(etp.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(tr).where(eq(tr.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(contratos).where(eq(contratos.processoId, input.processoId)),
      peopleIds.length
        ? db.select({ id: pessoas.id, nome: pessoas.nome, cargo: pessoas.cargo }).from(pessoas).where(inArray(pessoas.id, peopleIds))
        : Promise.resolve([]),
      db
        .select({ total: count() })
        .from(etpCotacoesPreliminares)
        .innerJoin(itensProcesso, eq(itensProcesso.id, etpCotacoesPreliminares.itemId))
        .where(eq(itensProcesso.processoId, input.processoId))
        .then((rows) => rows[0]),
    ]);

    const latestTimeline = await db
      .select({
        moduloOrigem: movimentacoesWorkflow.moduloOrigem,
        moduloDestino: movimentacoesWorkflow.moduloDestino,
        descricao: movimentacoesWorkflow.descricao,
        observacao: movimentacoesWorkflow.observacao,
        criadoEm: movimentacoesWorkflow.criadoEm,
      })
      .from(movimentacoesWorkflow)
      .where(eq(movimentacoesWorkflow.processoId, input.processoId))
      .orderBy(desc(movimentacoesWorkflow.criadoEm))
      .limit(12);

    const peopleMap = new Map(peopleRows.map((row) => [row.id, { nome: row.nome, cargo: row.cargo }]));
    const contratosAtivos = contratosRows.filter((row) => row.status === "ATIVO").length;
    const diasParado = daysSince(baseRow.workflow?.atualizadoEm ?? baseRow.processo.criadoEm);

    const etapas = [
      { chave: "cadastro", label: "Cadastro do processo", status: "CONCLUIDO", detalhe: "Processo criado e identificado no sistema." },
      {
        chave: "dfd",
        label: "DFD",
        status: dfdRow ? (dfdRow.concluido ? "CONCLUIDO" : "EM_ANDAMENTO") : "PENDENTE",
        detalhe: dfdRow ? "Documento de Formalização da Demanda registrado." : "Etapa ainda não iniciada.",
      },
      {
        chave: "etp",
        label: "ETP",
        status: etpRow ? (etpRow.concluido ? "CONCLUIDO" : "EM_ANDAMENTO") : "PENDENTE",
        detalhe: etpRow ? "Estudo Técnico Preliminar controlado no Planejamento." : "Etapa ainda não iniciada.",
      },
      {
        chave: "cotacoes",
        label: "Cotações preliminares",
        status: Number(cotacaoRow?.total ?? 0) > 0 ? "CONCLUIDO" : etpRow ? "EM_ANDAMENTO" : "PENDENTE",
        detalhe:
          Number(cotacaoRow?.total ?? 0) > 0
            ? `${Number(cotacaoRow?.total ?? 0)} registro(s) na composição do mapa comparativo.`
            : "Ainda sem registros válidos para estimativa de valor.",
      },
      {
        chave: "tr",
        label: "TR",
        status: trRow ? (trRow.concluido ? "CONCLUIDO" : "EM_ANDAMENTO") : "PENDENTE",
        detalhe: trRow ? "Etapa do Termo de Referência controlada no Planejamento." : "Termo de Referência ainda não registrado.",
      },
      {
        chave: "publicacao",
        label: "Publicidade",
        status: baseRow.processo.publicado ? "CONCLUIDO" : baseRow.workflow?.moduloAtual === "LICITACAO" ? "EM_ANDAMENTO" : "PENDENTE",
        detalhe: baseRow.processo.publicado
          ? `Publicado${baseRow.processo.numeroEdital ? ` sob o edital ${baseRow.processo.numeroEdital}` : ""}.`
          : "A publicação será controlada na Licitação.",
      },
      {
        chave: "contrato",
        label: "Contratação",
        status: contratosRows.length ? "CONCLUIDO" : "PENDENTE",
        detalhe: contratosRows.length
          ? `${contratosRows.length} contrato(s) associado(s), sendo ${contratosAtivos} ativo(s).`
          : "Ainda não há contratos vinculados.",
      },
    ];

    return {
      processo: {
        ...baseRow.processo,
        ativo: baseRow.processo.ativo,
        valorEstimado: baseRow.processo.valorEstimado ? toNumber(baseRow.processo.valorEstimado) : null,
        valorHomologado: baseRow.processo.valorHomologado ? toNumber(baseRow.processo.valorHomologado) : null,
        secretaria: baseRow.secretaria,
        modalidade: baseRow.modalidade,
        statusAtual: baseRow.status,
        autoridadeCompetente: baseRow.processo.autoridadeCompetenteId
          ? peopleMap.get(baseRow.processo.autoridadeCompetenteId) ?? null
          : null,
        condutorProcesso: baseRow.processo.condutorProcessoId ? peopleMap.get(baseRow.processo.condutorProcessoId) ?? null : null,
      },
      workflow: baseRow.workflow,
      gerencial: {
        diasParado,
        documentos: Number(docRow?.total ?? 0),
        itens: Number(itemRow?.total ?? 0),
        contratos: contratosRows.length,
        contratosAtivos,
      },
      etapas,
      timeline: latestTimeline,
    };
  }),
});



