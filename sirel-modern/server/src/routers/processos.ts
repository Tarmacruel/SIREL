import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { processoCreateInputSchema, processoListInputSchema } from "@sirel/shared/schemas/processos";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  contratos,
  documentos,
  modalidades,
  movimentacoesWorkflow,
  pessoas,
  processos,
  secretarias,
  statusProcesso,
  workflowProcesso,
} from "../db/schema.js";
import { getNextNumeroSirel } from "../lib/processo-identity.js";
import { gestorProcedure, publicProcedure, router } from "../trpc.js";

export const processosRouter = router({
  list: publicProcedure.input(processoListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [];

    if (input.secretariaId) filters.push(eq(processos.secretariaId, input.secretariaId));
    if (input.statusId) filters.push(eq(processos.statusId, input.statusId));
    if (input.moduloAtual) filters.push(eq(workflowProcesso.moduloAtual, input.moduloAtual as never));
    if (input.search) {
      filters.push(
        or(
          ilike(processos.numeroSirel, `%${input.search}%`),
          ilike(processos.objeto, `%${input.search}%`),
          ilike(secretarias.nome, `%${input.search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const items = await db
      .select({
        id: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroEdital: processos.numeroEdital,
        secretaria: secretarias.nome,
        modalidade: modalidades.nome,
        status: statusProcesso.nome,
        moduloAtual: workflowProcesso.moduloAtual,
        objeto: processos.objeto,
        valorEstimado: processos.valorEstimado,
        dataAbertura: processos.dataAbertura,
        foraDoFluxo: processos.foraDoFluxo,
      })
      .from(processos)
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(whereClause)
      .orderBy(desc(processos.criadoEm))
      .limit(input.pageSize)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(processos)
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(whereClause);

    return { page: input.page, pageSize: input.pageSize, total: Number(totalRow?.total ?? 0), items };
  }),

  create: gestorProcedure.input(processoCreateInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const numeroSirel = await getNextNumeroSirel(db, input.anoReferencia);
    const moduloInicial = input.foraDoFluxo ? input.moduloInicial ?? "DOCUMENTOS" : "PLANEJAMENTO";

    const [created] = await db
      .insert(processos)
      .values({
        numeroSirel,
        numeroAdministrativo: input.numeroAdministrativo,
        numeroEdital: null,
        anoReferencia: input.anoReferencia,
        foraDoFluxo: input.foraDoFluxo,
        secretariaId: input.secretariaId,
        modalidadeId: input.modalidadeId,
        statusId: input.statusId,
        autoridadeCompetenteId: input.autoridadeCompetenteId,
        condutorProcessoId: null,
        objeto: input.objeto,
        valorEstimado: input.valorEstimado?.toFixed(2),
        escopoDisputa: input.escopoDisputa ?? "GLOBAL",
        criterioJulgamento: input.criterioJulgamento,
        modoDisputa: input.modoDisputa ?? "NAO_SE_APLICA",
        tipoObjeto: input.tipoObjeto ?? "PRODUTO",
        tipoContratacao: input.tipoContratacao ?? "AQUISICAO",
        dataAbertura: input.dataAbertura,
        criadoPor: ctx.user?.id ?? null,
      })
      .returning();

    await db.insert(workflowProcesso).values({
      processoId: created.id,
      moduloAtual: moduloInicial,
      situacao: "RASCUNHO",
      etapaAtual: input.foraDoFluxo ? "Cadastro inicial fora do fluxo" : "Cadastro inicial no planejamento",
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
    const [processo] = await db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1);
    const [workflow] = await db.select().from(workflowProcesso).where(eq(workflowProcesso.processoId, input.processoId)).limit(1);
    const [docs] = await db.select({ total: count() }).from(documentos).where(eq(documentos.processoId, input.processoId));
    const [contratosAtivos] = await db
      .select({ total: count() })
      .from(contratos)
      .where(and(eq(contratos.processoId, input.processoId), eq(contratos.status, "ATIVO")));

    const peopleIds = [processo?.autoridadeCompetenteId, processo?.condutorProcessoId].filter((value): value is number => Boolean(value));
    const peopleMap = new Map<number, { nome: string; cargo: string | null }>();
    if (peopleIds.length) {
      const peopleRows = await db
        .select({ id: pessoas.id, nome: pessoas.nome, cargo: pessoas.cargo })
        .from(pessoas)
        .where(inArray(pessoas.id, peopleIds));
      for (const row of peopleRows) {
        peopleMap.set(row.id, { nome: row.nome, cargo: row.cargo });
      }
    }

    return {
      processo: processo
        ? {
            ...processo,
            autoridadeCompetente: processo.autoridadeCompetenteId ? peopleMap.get(processo.autoridadeCompetenteId) ?? null : null,
            condutorProcesso: processo.condutorProcessoId ? peopleMap.get(processo.condutorProcessoId) ?? null : null,
          }
        : null,
      workflow: workflow ?? null,
      documentos: Number(docs?.total ?? 0),
      contratosAtivos: Number(contratosAtivos?.total ?? 0),
    };
  }),
});
