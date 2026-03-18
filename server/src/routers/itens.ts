import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  contratoItemDeleteInputSchema,
  contratoItemSaveInputSchema,
  itemDeleteInputSchema,
  itemDetailInputSchema,
  itemListInputSchema,
  itemSaveInputSchema,
  itemToggleInputSchema,
} from "@sirel/shared/schemas/itens";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  catalogoItens,
  contratoItens,
  contratos,
  cotacoes,
  documentos,
  etpCotacoesPreliminares,
  fornecedores,
  itensProcesso,
  movimentacoesWorkflow,
  processos,
  secretarias,
  workflowProcesso,
} from "../db/schema.js";
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

function normalizeSupplierKey(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

interface ItemMetric {
  processoIds: Set<number>;
  contratoIds: Set<number>;
  fornecedorKeys: Set<string>;
  saldoTotal: number;
  saldoControlado: boolean;
  possuiSaldo: boolean;
  vigente: boolean;
}

function createMetricMap(catalogoIds: number[]) {
  const map = new Map<number, ItemMetric>();
  for (const id of catalogoIds) {
    map.set(id, {
      processoIds: new Set<number>(),
      contratoIds: new Set<number>(),
      fornecedorKeys: new Set<string>(),
      saldoTotal: 0,
      saldoControlado: false,
      possuiSaldo: false,
      vigente: false,
    });
  }
  return map;
}

async function buildMetrics(catalogoIds: number[]) {
  const db = requireDb();
  const metrics = createMetricMap(catalogoIds);
  if (!catalogoIds.length) return metrics;

  const processRows = await db
    .select({
      catalogoItemId: itensProcesso.catalogoItemId,
      processoId: itensProcesso.processoId,
      itemId: itensProcesso.id,
    })
    .from(itensProcesso)
    .where(inArray(itensProcesso.catalogoItemId, catalogoIds));

  const processoIds = new Set<number>();
  const itemIds = new Set<number>();

  for (const row of processRows) {
    if (!row.catalogoItemId) continue;
    const metric = metrics.get(row.catalogoItemId);
    if (!metric) continue;
    metric.processoIds.add(row.processoId);
    processoIds.add(row.processoId);
    itemIds.add(row.itemId);
  }

  if (processoIds.size) {
    const contractRows = await db
      .select({
        catalogoItemId: itensProcesso.catalogoItemId,
        contratoId: contratos.id,
        status: contratos.status,
      })
      .from(itensProcesso)
      .innerJoin(contratos, eq(contratos.processoId, itensProcesso.processoId))
      .where(inArray(itensProcesso.catalogoItemId, catalogoIds));

    for (const row of contractRows) {
      if (!row.catalogoItemId) continue;
      const metric = metrics.get(row.catalogoItemId);
      if (!metric) continue;
      metric.contratoIds.add(row.contratoId);
      if (row.status === "ATIVO") {
        metric.vigente = true;
      }
    }
  }

  if (itemIds.size) {
    const etpRows = await db
      .select({
        catalogoItemId: itensProcesso.catalogoItemId,
        fornecedorNome: etpCotacoesPreliminares.fornecedorNome,
        documento: etpCotacoesPreliminares.documento,
      })
      .from(etpCotacoesPreliminares)
      .innerJoin(itensProcesso, eq(itensProcesso.id, etpCotacoesPreliminares.itemId))
      .where(inArray(etpCotacoesPreliminares.itemId, Array.from(itemIds)));

    for (const row of etpRows) {
      if (!row.catalogoItemId) continue;
      const metric = metrics.get(row.catalogoItemId);
      if (!metric) continue;
      metric.fornecedorKeys.add(normalizeSupplierKey([row.documento, row.fornecedorNome]));
    }

    const cotacaoRows = await db
      .select({
        catalogoItemId: itensProcesso.catalogoItemId,
        razaoSocial: fornecedores.razaoSocial,
        cnpj: fornecedores.cnpj,
      })
      .from(cotacoes)
      .innerJoin(itensProcesso, eq(itensProcesso.id, cotacoes.itemId))
      .innerJoin(fornecedores, eq(fornecedores.id, cotacoes.fornecedorId))
      .where(inArray(cotacoes.itemId, Array.from(itemIds)));

    for (const row of cotacaoRows) {
      if (!row.catalogoItemId) continue;
      const metric = metrics.get(row.catalogoItemId);
      if (!metric) continue;
      metric.fornecedorKeys.add(normalizeSupplierKey([row.cnpj, row.razaoSocial]));
    }
  }

  const saldoRows = await db
    .select({
      catalogoItemId: contratoItens.catalogoItemId,
      contratoId: contratoItens.contratoId,
      quantidadeContratada: contratoItens.quantidadeContratada,
      quantidadeConsumida: contratoItens.quantidadeConsumida,
      ativo: contratoItens.ativo,
      statusContrato: contratos.status,
    })
    .from(contratoItens)
    .innerJoin(contratos, eq(contratos.id, contratoItens.contratoId))
    .where(inArray(contratoItens.catalogoItemId, catalogoIds));

  for (const row of saldoRows) {
    const metric = metrics.get(row.catalogoItemId);
    if (!metric) continue;
    const saldoAtual = Math.max(0, toNumber(row.quantidadeContratada) - toNumber(row.quantidadeConsumida));
    metric.saldoControlado = true;
    metric.contratoIds.add(row.contratoId);
    metric.saldoTotal += saldoAtual;
    if (saldoAtual > 0) {
      metric.possuiSaldo = true;
    }
    if (row.ativo && row.statusContrato === "ATIVO") {
      metric.vigente = true;
    }
  }

  return metrics;
}

export const itensRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const rows = await db.select({ id: catalogoItens.id, ativo: catalogoItens.ativo }).from(catalogoItens);
    const metrics = await buildMetrics(rows.map((row) => row.id));

    const ativos = rows.filter((row) => row.ativo).length;
    const emProcessos = rows.filter((row) => (metrics.get(row.id)?.processoIds.size ?? 0) > 0).length;
    const comContratos = rows.filter((row) => (metrics.get(row.id)?.contratoIds.size ?? 0) > 0).length;
    const vigentes = rows.filter((row) => metrics.get(row.id)?.vigente).length;
    const comSaldo = rows.filter((row) => metrics.get(row.id)?.possuiSaldo).length;

    return {
      total: rows.length,
      ativos,
      emProcessos,
      comContratos,
      vigentes,
      comSaldo,
    };
  }),

  list: publicProcedure.input(itemListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [];
    if (typeof input.ativo === "boolean") {
      filters.push(eq(catalogoItens.ativo, input.ativo));
    }
    if (input.search) {
      filters.push(ilike(catalogoItens.descricao, `%${input.search}%`));
    }

    const whereClause = filters.length ? and(...filters) : undefined;
    const catalogRows = await db
      .select({
        id: catalogoItens.id,
        descricao: catalogoItens.descricao,
        unidadePadrao: catalogoItens.unidadePadrao,
        valorReferencia: catalogoItens.valorReferencia,
        ativo: catalogoItens.ativo,
        criadoEm: catalogoItens.criadoEm,
        atualizadoEm: catalogoItens.atualizadoEm,
      })
      .from(catalogoItens)
      .where(whereClause)
      .orderBy(asc(catalogoItens.descricao), asc(catalogoItens.id));

    const metrics = await buildMetrics(catalogRows.map((row) => row.id));
    let items = catalogRows.map((row) => {
      const metric = metrics.get(row.id);
      return {
        ...row,
        valorReferencia: row.valorReferencia ? toNumber(row.valorReferencia) : null,
        totalProcessos: metric?.processoIds.size ?? 0,
        totalContratos: metric?.contratoIds.size ?? 0,
        totalFornecedores: metric?.fornecedorKeys.size ?? 0,
        saldoTotal: Number((metric?.saldoTotal ?? 0).toFixed(3)),
        saldoControlado: metric?.saldoControlado ?? false,
        possuiSaldo: metric?.possuiSaldo ?? false,
        vigente: metric?.vigente ?? false,
      };
    });

    if (typeof input.vigente === "boolean") {
      items = items.filter((item) => item.vigente === input.vigente);
    }
    if (typeof input.comSaldo === "boolean") {
      items = items.filter((item) => item.possuiSaldo === input.comSaldo);
    }

    const total = items.length;
    const offset = (input.page - 1) * input.pageSize;
    const paged = items.slice(offset, offset + input.pageSize);

    return {
      page: input.page,
      pageSize: input.pageSize,
      total,
      items: paged,
    };
  }),

  detail: publicProcedure.input(itemDetailInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const [item] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.itemId)).limit(1);
    if (!item) {
      return null;
    }

    const metrics = await buildMetrics([input.itemId]);
    const metric = metrics.get(input.itemId) ?? createMetricMap([input.itemId]).get(input.itemId)!;

    const processosRelacionados = await db
      .select({
        itemProcessoId: itensProcesso.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        objeto: processos.objeto,
        secretaria: secretarias.nome,
        numeroItem: itensProcesso.numeroItem,
        quantidade: itensProcesso.quantidade,
        unidade: itensProcesso.unidade,
        valorUnitarioEstimado: itensProcesso.valorUnitarioEstimado,
        valorTotalEstimado: itensProcesso.valorTotalEstimado,
        moduloAtual: workflowProcesso.moduloAtual,
        situacao: workflowProcesso.situacao,
        etapaAtual: workflowProcesso.etapaAtual,
        atualizadoEm: workflowProcesso.atualizadoEm,
      })
      .from(itensProcesso)
      .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(eq(itensProcesso.catalogoItemId, input.itemId))
      .orderBy(desc(workflowProcesso.atualizadoEm), asc(processos.numeroSirel), asc(itensProcesso.numeroItem));

    const processosIds = Array.from(new Set(processosRelacionados.map((row) => row.processoId)));
    const documentosCountRows = processosIds.length
      ? await db
          .select({ processoId: documentos.processoId, total: count() })
          .from(documentos)
          .where(inArray(documentos.processoId, processosIds))
          .groupBy(documentos.processoId)
      : [];
    const documentosMap = new Map(documentosCountRows.map((row) => [row.processoId, Number(row.total)]));

    const contratosRelacionados = await db
      .select({
        contratoId: contratos.id,
        numeroContrato: contratos.numeroContrato,
        processoId: processos.id,
        processoNumeroSirel: processos.numeroSirel,
        fornecedor: fornecedores.razaoSocial,
        status: contratos.status,
        dataVigenciaInicio: contratos.dataVigenciaInicio,
        dataVigenciaFim: contratos.dataVigenciaFim,
        valorContrato: contratos.valorContrato,
        controleSaldoId: contratoItens.id,
        quantidadeContratada: contratoItens.quantidadeContratada,
        quantidadeConsumida: contratoItens.quantidadeConsumida,
        valorUnitario: contratoItens.valorUnitario,
        ativoControle: contratoItens.ativo,
      })
      .from(contratos)
      .innerJoin(processos, eq(processos.id, contratos.processoId))
      .leftJoin(fornecedores, eq(fornecedores.id, contratos.fornecedorId))
      .leftJoin(
        contratoItens,
        and(eq(contratoItens.contratoId, contratos.id), eq(contratoItens.catalogoItemId, input.itemId)),
      )
      .where(
        processosIds.length
          ? inArray(contratos.processoId, processosIds)
          : eq(contratoItens.catalogoItemId, input.itemId),
      )
      .orderBy(desc(contratos.atualizadoEm), asc(contratos.numeroContrato));

    const fornecedoresRelacionados = [
      ...(await db
        .select({
          origem: fornecedores.razaoSocial,
          documento: fornecedores.cnpj,
          referencia: cotacoes.dataCotacao,
          tipo: fornecedores.razaoSocial,
        })
        .from(cotacoes)
        .innerJoin(itensProcesso, eq(itensProcesso.id, cotacoes.itemId))
        .innerJoin(fornecedores, eq(fornecedores.id, cotacoes.fornecedorId))
        .where(eq(itensProcesso.catalogoItemId, input.itemId))),
      ...(await db
        .select({
          origem: etpCotacoesPreliminares.fornecedorNome,
          documento: etpCotacoesPreliminares.documento,
          referencia: etpCotacoesPreliminares.dataCotacao,
          tipo: etpCotacoesPreliminares.fonte,
        })
        .from(etpCotacoesPreliminares)
        .innerJoin(itensProcesso, eq(itensProcesso.id, etpCotacoesPreliminares.itemId))
        .where(eq(itensProcesso.catalogoItemId, input.itemId))),
    ];

    const fornecedorMap = new Map<
      string,
      { nome: string; documento: string | null; origem: string; ultimaReferencia: string | Date | null; totalOcorrencias: number }
    >();

    for (const row of fornecedoresRelacionados) {
      const key = normalizeSupplierKey([row.documento, row.origem]);
      const current = fornecedorMap.get(key);
      if (!current) {
        fornecedorMap.set(key, {
          nome: row.origem,
          documento: row.documento ?? null,
          origem: row.tipo,
          ultimaReferencia: row.referencia,
          totalOcorrencias: 1,
        });
      } else {
        current.totalOcorrencias += 1;
        if (row.referencia && (!current.ultimaReferencia || new Date(row.referencia).getTime() > new Date(current.ultimaReferencia).getTime())) {
          current.ultimaReferencia = row.referencia;
        }
      }
    }

    const rastreabilidade = processosIds.length
      ? await db
          .select({
            id: movimentacoesWorkflow.id,
            processoId: movimentacoesWorkflow.processoId,
            numeroSirel: processos.numeroSirel,
            descricao: movimentacoesWorkflow.descricao,
            moduloDestino: movimentacoesWorkflow.moduloDestino,
            criadoEm: movimentacoesWorkflow.criadoEm,
          })
          .from(movimentacoesWorkflow)
          .innerJoin(processos, eq(processos.id, movimentacoesWorkflow.processoId))
          .where(inArray(movimentacoesWorkflow.processoId, processosIds))
          .orderBy(desc(movimentacoesWorkflow.criadoEm))
          .limit(20)
      : [];

    const contratosDisponiveis = await db
      .select({
        id: contratos.id,
        numeroContrato: contratos.numeroContrato,
        processoNumeroSirel: processos.numeroSirel,
      })
      .from(contratos)
      .innerJoin(processos, eq(processos.id, contratos.processoId))
      .orderBy(asc(contratos.numeroContrato));

    return {
      item: {
        ...item,
        valorReferencia: item.valorReferencia ? toNumber(item.valorReferencia) : null,
      },
      metrics: {
        totalProcessos: metric.processoIds.size,
        totalContratos: metric.contratoIds.size,
        totalFornecedores: metric.fornecedorKeys.size,
        saldoTotal: Number(metric.saldoTotal.toFixed(3)),
        saldoControlado: metric.saldoControlado,
        possuiSaldo: metric.possuiSaldo,
        vigente: metric.vigente,
      },
      processos: processosRelacionados.map((row) => ({
        ...row,
        quantidade: toNumber(row.quantidade),
        valorUnitarioEstimado: row.valorUnitarioEstimado ? toNumber(row.valorUnitarioEstimado) : null,
        valorTotalEstimado: row.valorTotalEstimado ? toNumber(row.valorTotalEstimado) : null,
        diasParado: daysSince(row.atualizadoEm),
        documentos: documentosMap.get(row.processoId) ?? 0,
      })),
      contratos: contratosRelacionados.map((row) => {
        const quantidadeContratada = row.quantidadeContratada ? toNumber(row.quantidadeContratada) : null;
        const quantidadeConsumida = row.quantidadeConsumida ? toNumber(row.quantidadeConsumida) : null;
        const saldoAtual =
          quantidadeContratada === null || quantidadeConsumida === null
            ? null
            : Number(Math.max(0, quantidadeContratada - quantidadeConsumida).toFixed(3));
        return {
          ...row,
          valorContrato: row.valorContrato ? toNumber(row.valorContrato) : null,
          quantidadeContratada,
          quantidadeConsumida,
          valorUnitario: row.valorUnitario ? toNumber(row.valorUnitario) : null,
          saldoAtual,
          vigente: row.status === "ATIVO",
        };
      }),
      fornecedores: Array.from(fornecedorMap.values()).sort((left, right) => left.nome.localeCompare(right.nome)),
      rastreabilidade,
      contratosDisponiveis,
    };
  }),

  save: gestorProcedure.input(itemSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const payload = {
      descricao: input.descricao,
      unidadePadrao: input.unidadePadrao.toUpperCase(),
      valorReferencia: input.valorReferencia?.toFixed(2) ?? null,
      ativo: input.ativo,
      atualizadoEm: new Date(),
    };

    if (input.itemId) {
      const [existing] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.itemId)).limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item do catálogo não encontrado." });
      }

      const [updated] = await db.update(catalogoItens).set(payload).where(eq(catalogoItens.id, input.itemId)).returning();
      await logAuditoria(ctx, {
        tabela: "catalogo_itens",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: existing,
        dadosNovos: updated,
        descricao: `Item ${updated.id} do catálogo atualizado`,
      });
      return updated;
    }

    const [created] = await db
      .insert(catalogoItens)
      .values({
        ...payload,
        criadoPor: ctx.user?.id ?? null,
        criadoEm: new Date(),
      })
      .returning();

    await logAuditoria(ctx, {
      tabela: "catalogo_itens",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Item ${created.id} criado no catálogo central`,
    });
    return created;
  }),

  toggleAtivo: gestorProcedure.input(itemToggleInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [existing] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.itemId)).limit(1);
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Item do catálogo não encontrado." });
    }

    const [updated] = await db
      .update(catalogoItens)
      .set({ ativo: input.ativo, atualizadoEm: new Date() })
      .where(eq(catalogoItens.id, input.itemId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "catalogo_itens",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: existing,
      dadosNovos: updated,
      descricao: `Item ${updated.id} ${input.ativo ? "ativado" : "desativado"} no catálogo`,
    });
    return updated;
  }),

  delete: gestorProcedure.input(itemDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [existing] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.itemId)).limit(1);
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Item do catálogo não encontrado." });
    }

    const [processRefs, contractRefs] = await Promise.all([
      db.select({ total: count() }).from(itensProcesso).where(eq(itensProcesso.catalogoItemId, input.itemId)).then((rows) => rows[0]),
      db.select({ total: count() }).from(contratoItens).where(eq(contratoItens.catalogoItemId, input.itemId)).then((rows) => rows[0]),
    ]);

    if (Number(processRefs?.total ?? 0) > 0 || Number(contractRefs?.total ?? 0) > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Este item já possui rastreabilidade no sistema. Desative o cadastro em vez de excluir.",
      });
    }

    await db.delete(catalogoItens).where(eq(catalogoItens.id, input.itemId));
    await logAuditoria(ctx, {
      tabela: "catalogo_itens",
      registroId: existing.id,
      acao: "DELETE",
      dadosAnteriores: existing,
      descricao: `Item ${existing.id} removido do catálogo central`,
    });

    return { success: true };
  }),

  saveContratoControle: gestorProcedure.input(contratoItemSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [item, contrato] = await Promise.all([
      db.select().from(catalogoItens).where(eq(catalogoItens.id, input.itemId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(contratos).where(eq(contratos.id, input.contratoId)).limit(1).then((rows) => rows[0] ?? null),
    ]);

    if (!item) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Item do catálogo não encontrado." });
    }
    if (!contrato) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
    }

    const payload = {
      contratoId: input.contratoId,
      catalogoItemId: input.itemId,
      descricao: input.descricao,
      unidade: input.unidade,
      quantidadeContratada: input.quantidadeContratada.toString(),
      quantidadeConsumida: input.quantidadeConsumida.toString(),
      valorUnitario: input.valorUnitario?.toFixed(2) ?? null,
      ativo: input.ativo,
      atualizadoEm: new Date(),
    };

    if (input.contratoItemId) {
      const [existing] = await db.select().from(contratoItens).where(eq(contratoItens.id, input.contratoItemId)).limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Controle de saldo não encontrado." });
      }

      const [updated] = await db.update(contratoItens).set(payload).where(eq(contratoItens.id, input.contratoItemId)).returning();
      await logAuditoria(ctx, {
        tabela: "contrato_itens",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: existing,
        dadosNovos: updated,
        descricao: `Controle de saldo do item ${input.itemId} atualizado no contrato ${contrato.numeroContrato}`,
      });
      return updated;
    }

    const [created] = await db
      .insert(contratoItens)
      .values({
        ...payload,
        criadoEm: new Date(),
      })
      .returning();

    await logAuditoria(ctx, {
      tabela: "contrato_itens",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Controle de saldo criado para o item ${input.itemId} no contrato ${contrato.numeroContrato}`,
    });
    return created;
  }),

  deleteContratoControle: gestorProcedure.input(contratoItemDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [existing] = await db.select().from(contratoItens).where(eq(contratoItens.id, input.contratoItemId)).limit(1);
    if (!existing || existing.catalogoItemId !== input.itemId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Controle de saldo não encontrado para este item." });
    }

    await db.delete(contratoItens).where(eq(contratoItens.id, input.contratoItemId));
    await logAuditoria(ctx, {
      tabela: "contrato_itens",
      registroId: existing.id,
      acao: "DELETE",
      dadosAnteriores: existing,
      descricao: `Controle de saldo ${existing.id} removido do item ${input.itemId}`,
    });
    return { success: true };
  }),
});
