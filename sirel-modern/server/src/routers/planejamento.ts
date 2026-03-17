import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import {
  catalogoItemCreateInputSchema,
  catalogoItemListInputSchema,
  dfdCatalogItemsAddInputSchema,
  dfdDeleteInputSchema,
  dfdItemDeleteInputSchema,
  dfdItemSaveInputSchema,
  dfdSaveInputSchema,
  planejamentoListInputSchema,
} from "@sirel/shared/schemas/planejamento";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  catalogoItens,
  dfd,
  dfdResponsaveis,
  dfdSecretariasParticipantes,
  itensProcesso,
  movimentacoesWorkflow,
  pessoas,
  processos,
  secretarias,
  users,
  workflowProcesso,
} from "../db/schema.js";
import { gestorProcedure, publicProcedure, router } from "../trpc.js";

async function resolveSecretariaAdministracaoId() {
  const db = requireDb();
  const [secretariaAdministracao] = await db
    .select({ id: secretarias.id, nome: secretarias.nome, sigla: secretarias.sigla })
    .from(secretarias)
    .where(
      and(
        eq(secretarias.ativo, true),
        or(
          ilike(secretarias.nome, "%ADMINISTRA%"),
          ilike(secretarias.sigla, "%ADM%"),
        ),
      ),
    )
    .orderBy(asc(secretarias.nome))
    .limit(1);

  if (!secretariaAdministracao) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cadastre a Secretaria de Administracao antes de registrar uma demanda sistemica.",
    });
  }

  return secretariaAdministracao.id;
}

export const planejamentoRouter = router({
  list: publicProcedure.input(planejamentoListInputSchema.optional()).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [eq(workflowProcesso.moduloAtual, "PLANEJAMENTO")];

    if (input?.search) {
      filters.push(
        or(
          ilike(processos.numeroSirel, `%${input.search}%`),
          ilike(processos.objeto, `%${input.search}%`),
          ilike(secretarias.nome, `%${input.search}%`),
        ),
      );
    }
    if (input?.somenteSemDfd) {
      filters.push(isNull(dfd.id));
    }

    const rows = await db
      .select({
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        secretaria: secretarias.nome,
        objeto: processos.objeto,
        etapaAtual: workflowProcesso.etapaAtual,
        situacao: workflowProcesso.situacao,
        dfdId: dfd.id,
        dfdConcluido: dfd.concluido,
        atualizadoEm: workflowProcesso.atualizadoEm,
        grauPrioridade: dfd.grauPrioridade,
        demandaSistemica: dfd.demandaSistemica,
      })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(dfd, eq(dfd.processoId, processos.id))
      .where(and(...filters))
      .orderBy(asc(processos.numeroSirel));

    const processoIds = rows.map((row) => row.processoId);
    const itemCounts = processoIds.length
      ? await db
          .select({ processoId: itensProcesso.processoId, total: count() })
          .from(itensProcesso)
          .where(inArray(itensProcesso.processoId, processoIds))
          .groupBy(itensProcesso.processoId)
      : [];
    const itemMap = new Map(itemCounts.map((row) => [row.processoId, Number(row.total)]));

    return rows.map((row) => ({
      ...row,
      itensCount: itemMap.get(row.processoId) ?? 0,
    }));
  }),

  detail: publicProcedure.input(z.object({ processoId: z.number().int().positive() })).query(async ({ input }) => {
    const db = requireDb();
    const [processo] = await db
      .select({
        id: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroAdministrativo: processos.numeroAdministrativo,
        objeto: processos.objeto,
        secretariaId: secretarias.id,
        secretaria: secretarias.nome,
        etapaAtual: workflowProcesso.etapaAtual,
        situacao: workflowProcesso.situacao,
        autoridadeCompetenteId: processos.autoridadeCompetenteId,
      })
      .from(processos)
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(eq(processos.id, input.processoId))
      .limit(1);

    if (!processo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
    }

    const [dfdRow] = await db.select().from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1);

    const [solicitante, secretariaResponsavel, responsaveis, secretariasParticipantes, itens] = await Promise.all([
      dfdRow?.solicitanteUserId
        ? db
            .select({ id: users.id, name: users.name, username: users.username, email: users.email })
            .from(users)
            .where(eq(users.id, dfdRow.solicitanteUserId))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
      dfdRow?.secretariaResponsavelId
        ? db
            .select({ id: secretarias.id, nome: secretarias.nome, sigla: secretarias.sigla })
            .from(secretarias)
            .where(eq(secretarias.id, dfdRow.secretariaResponsavelId))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
      dfdRow
        ? db
            .select({ id: pessoas.id, nome: pessoas.nome, cargo: pessoas.cargo, secretariaId: pessoas.secretariaId })
            .from(dfdResponsaveis)
            .innerJoin(pessoas, eq(pessoas.id, dfdResponsaveis.pessoaId))
            .where(eq(dfdResponsaveis.dfdId, dfdRow.id))
            .orderBy(asc(pessoas.nome))
        : Promise.resolve([]),
      dfdRow
        ? db
            .select({ id: secretarias.id, nome: secretarias.nome, sigla: secretarias.sigla })
            .from(dfdSecretariasParticipantes)
            .innerJoin(secretarias, eq(secretarias.id, dfdSecretariasParticipantes.secretariaId))
            .where(eq(dfdSecretariasParticipantes.dfdId, dfdRow.id))
            .orderBy(asc(secretarias.nome))
        : Promise.resolve([]),
      db
        .select({
          id: itensProcesso.id,
          numeroItem: itensProcesso.numeroItem,
          descricao: itensProcesso.descricao,
          quantidade: itensProcesso.quantidade,
          unidade: itensProcesso.unidade,
        })
        .from(itensProcesso)
        .where(eq(itensProcesso.processoId, input.processoId))
        .orderBy(asc(itensProcesso.numeroItem)),
    ]);

    return {
      processo,
      dfd: dfdRow
        ? {
            ...dfdRow,
            solicitante,
            secretariaResponsavel,
            responsaveis,
            secretariasParticipantes,
          }
        : null,
      itens,
    };
  }),

  saveDfd: gestorProcedure.input(dfdSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [processo] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);
    if (!processo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
    }

    const [existingDfd] = await db.select().from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1);
    const secretariasParticipantes = input.demandaSistemica ? Array.from(new Set(input.secretariasParticipantes)) : [];
    const responsavelIds = Array.from(new Set(input.responsavelIds));
    const secretariaResponsavelId = input.demandaSistemica ? await resolveSecretariaAdministracaoId() : processo.secretariaId;
    const [itemCountRow] = await db.select({ total: count() }).from(itensProcesso).where(eq(itensProcesso.processoId, input.processoId));
    const itensRegistrados = Number(itemCountRow?.total ?? 0);

    if (input.concluir && itensRegistrados <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Adicione ao menos um item na selecao de itens da DFD antes de concluir.",
      });
    }

    const payload = {
      setorDemandante: input.setorDemandante,
      grauPrioridade: input.grauPrioridade,
      demandaSistemica: input.demandaSistemica,
      justificativa: input.justificativa,
      dataNecessidade: input.dataNecessidade,
      dataPrevistaConclusao: input.dataPrevistaConclusao,
      observacoes: input.observacoes ?? null,
      secretariaResponsavelId,
      solicitanteUserId: existingDfd?.solicitanteUserId ?? ctx.user?.id ?? null,
      concluido: input.concluir,
      atualizadoEm: new Date(),
    };

    const [saved] = existingDfd
      ? await db.update(dfd).set(payload).where(eq(dfd.id, existingDfd.id)).returning()
      : await db
          .insert(dfd)
          .values({
            processoId: input.processoId,
            criadoEm: new Date(),
            ...payload,
          })
          .returning();

    await db.delete(dfdResponsaveis).where(eq(dfdResponsaveis.dfdId, saved.id));
    await db.delete(dfdSecretariasParticipantes).where(eq(dfdSecretariasParticipantes.dfdId, saved.id));

    if (responsavelIds.length) {
      await db.insert(dfdResponsaveis).values(
        responsavelIds.map((pessoaId) => ({
          dfdId: saved.id,
          pessoaId,
          criadoEm: new Date(),
        })),
      );
    }

    if (secretariasParticipantes.length) {
      await db.insert(dfdSecretariasParticipantes).values(
        secretariasParticipantes.map((secretariaId) => ({
          dfdId: saved.id,
          secretariaId,
          criadoEm: new Date(),
        })),
      );
    }

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: input.concluir ? "DFD concluida" : "DFD em elaboracao",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: existingDfd ? "DFD atualizada no Planejamento" : "DFD iniciada no Planejamento",
      observacao: input.concluir ? "DFD marcada como concluida." : "DFD salva em elaboracao.",
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "dfd",
      registroId: saved.id,
      acao: existingDfd ? "UPDATE" : "CREATE",
      dadosAnteriores: existingDfd ?? null,
      dadosNovos: {
        ...saved,
        responsavelIds,
        secretariasParticipantes,
      },
      descricao: `DFD do processo ${processo.numeroSirel} ${existingDfd ? "atualizada" : "criada"}`,
    });

    return saved;
  }),

  saveItem: gestorProcedure.input(dfdItemSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [processo] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);
    if (!processo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
    }

    const [dfdRow] = await db.select({ id: dfd.id }).from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1);
    if (!dfdRow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Salve a DFD antes de registrar itens." });
    }

    const [existingItem] = input.itemId
      ? await db
          .select()
          .from(itensProcesso)
          .where(and(eq(itensProcesso.id, input.itemId), eq(itensProcesso.processoId, input.processoId)))
          .limit(1)
      : [];

    if (input.itemId && !existingItem) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Item nao encontrado para este processo." });
    }

    const [lastItem] = await db
      .select({ numeroItem: itensProcesso.numeroItem })
      .from(itensProcesso)
      .where(eq(itensProcesso.processoId, input.processoId))
      .orderBy(desc(itensProcesso.numeroItem))
      .limit(1);

    const payload = {
      descricao: input.descricao,
      quantidade: input.quantidade.toString(),
      unidade: input.unidade,
      valorUnitarioEstimado: null,
      valorTotalEstimado: null,
      atualizadoEm: new Date(),
    };

    const [saved] = existingItem
      ? await db.update(itensProcesso).set(payload).where(eq(itensProcesso.id, existingItem.id)).returning()
      : await db
          .insert(itensProcesso)
          .values({
            processoId: input.processoId,
            numeroItem: (lastItem?.numeroItem ?? 0) + 1,
            criadoEm: new Date(),
            ...payload,
          })
          .returning();

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: "DFD e itens em elaboracao",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: existingItem ? "Item da DFD atualizado" : "Item da DFD adicionado",
      observacao: `Item ${saved.numeroItem} registrado no Planejamento.`,
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "itens_processo",
      registroId: saved.id,
      acao: existingItem ? "UPDATE" : "CREATE",
      dadosAnteriores: existingItem ?? null,
      dadosNovos: saved,
      descricao: `Item ${saved.numeroItem} da DFD do processo ${processo.numeroSirel} ${existingItem ? "atualizado" : "criado"}`,
    });

    return saved;
  }),

  deleteItem: gestorProcedure.input(dfdItemDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [existingItem] = await db
      .select()
      .from(itensProcesso)
      .where(and(eq(itensProcesso.id, input.itemId), eq(itensProcesso.processoId, input.processoId)))
      .limit(1);

    if (!existingItem) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Item nao encontrado para este processo." });
    }

    const [processo] = await db.select({ numeroSirel: processos.numeroSirel }).from(processos).where(eq(processos.id, input.processoId)).limit(1);

    await db.delete(itensProcesso).where(eq(itensProcesso.id, input.itemId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: "Item da DFD removido",
      observacao: `Item ${existingItem.numeroItem} removido da selecao da DFD.`,
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "itens_processo",
      registroId: existingItem.id,
      acao: "DELETE",
      dadosAnteriores: existingItem,
      descricao: `Item ${existingItem.numeroItem} da DFD do processo ${processo?.numeroSirel ?? input.processoId} removido`,
    });

    return { success: true };
  }),

  deleteDfd: gestorProcedure.input(dfdDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [existingDfd] = await db.select().from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1);
    if (!existingDfd) {
      throw new TRPCError({ code: "NOT_FOUND", message: "DFD nao encontrada para este processo." });
    }

    const [processo] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);
    const itensRemovidos = await db.select().from(itensProcesso).where(eq(itensProcesso.processoId, input.processoId));

    await db.delete(itensProcesso).where(eq(itensProcesso.processoId, input.processoId));
    await db.delete(dfd).where(eq(dfd.id, existingDfd.id));

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: "DFD pendente",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: "DFD excluida no Planejamento",
      observacao: "DFD e itens vinculados removidos para reinicio da etapa.",
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "dfd",
      registroId: existingDfd.id,
      acao: "DELETE",
      dadosAnteriores: { ...existingDfd, itensRemovidos },
      descricao: `DFD do processo ${processo?.numeroSirel ?? input.processoId} excluida`,
    });

    return { success: true };
  }),

  catalogList: publicProcedure.input(catalogoItemListInputSchema.optional()).query(async ({ input }) => {
    const db = requireDb();
    const filters = [eq(catalogoItens.ativo, true)];
    if (input?.search) {
      filters.push(ilike(catalogoItens.descricao, `%${input.search}%`));
    }

    return db
      .select({
        id: catalogoItens.id,
        descricao: catalogoItens.descricao,
        unidadePadrao: catalogoItens.unidadePadrao,
      })
      .from(catalogoItens)
      .where(and(...filters))
      .orderBy(asc(catalogoItens.descricao));
  }),

  createCatalogItem: gestorProcedure.input(catalogoItemCreateInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [created] = await db
      .insert(catalogoItens)
      .values({
        descricao: input.descricao,
        unidadePadrao: input.unidadePadrao,
        valorReferencia: null,
        criadoPor: ctx.user?.id ?? null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .returning();

    await logAuditoria(ctx, {
      tabela: "catalogo_itens",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Item ${created.id} criado no catalogo do Planejamento`,
    });

    return created;
  }),

  addCatalogItems: gestorProcedure.input(dfdCatalogItemsAddInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [processo] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);
    if (!processo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
    }

    const [dfdRow] = await db.select({ id: dfd.id }).from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1);
    if (!dfdRow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Salve a DFD antes de adicionar itens do catalogo." });
    }

    const catalogoIds = input.itens.map((item) => item.catalogoItemId);
    const catalogRows = await db
      .select({
        id: catalogoItens.id,
        descricao: catalogoItens.descricao,
        unidadePadrao: catalogoItens.unidadePadrao,
      })
      .from(catalogoItens)
      .where(inArray(catalogoItens.id, catalogoIds));
    const catalogMap = new Map(catalogRows.map((item) => [item.id, item]));

    const [lastItem] = await db
      .select({ numeroItem: itensProcesso.numeroItem })
      .from(itensProcesso)
      .where(eq(itensProcesso.processoId, input.processoId))
      .orderBy(desc(itensProcesso.numeroItem))
      .limit(1);

    let nextNumeroItem = (lastItem?.numeroItem ?? 0) + 1;
    const rowsToInsert = input.itens.map((item) => {
      const catalogItem = catalogMap.get(item.catalogoItemId);
      if (!catalogItem) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Um dos itens selecionados nao existe mais no catalogo." });
      }
      return {
        processoId: input.processoId,
        numeroItem: nextNumeroItem++,
        descricao: catalogItem.descricao,
        quantidade: item.quantidade.toString(),
        unidade: item.unidade || catalogItem.unidadePadrao,
        valorUnitarioEstimado: null,
        valorTotalEstimado: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      };
    });

    const inserted = rowsToInsert.length ? await db.insert(itensProcesso).values(rowsToInsert).returning() : [];

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: "DFD e itens em elaboracao",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: "Itens do catalogo adicionados a DFD",
      observacao: `${inserted.length} item(ns) incorporado(s) ao processo.`,
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "itens_processo",
      registroId: input.processoId,
      acao: "CREATE",
      dadosNovos: inserted,
      descricao: `Itens do catalogo adicionados a DFD do processo ${processo.numeroSirel}`,
    });

    return inserted;
  }),
});
