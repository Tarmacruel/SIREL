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
  etpCotacaoDeleteInputSchema,
  etpCotacaoSaveInputSchema,
  etpSaveInputSchema,
  planejamentoDocumentoGenerateInputSchema,
  planejamentoListInputSchema,
  trSaveInputSchema,
} from "@sirel/shared/schemas/planejamento";
import { metodologiaCotacaoLabels } from "@sirel/shared/const";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  catalogoItens,
  dfd,
  dfdResponsaveis,
  dfdSecretariasParticipantes,
  documentos,
  etp,
  etpCotacoesPreliminares,
  itensProcesso,
  movimentacoesWorkflow,
  pessoas,
  processos,
  secretarias,
  tr,
  users,
  workflowProcesso,
} from "../db/schema.js";
import { saveGeneratedPlanejamentoDocumento } from "../lib/planejamento-documentos.js";
import { gestorProcedure, publicProcedure, router } from "../trpc.js";

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyQuoteAgainstAverage(valorUnitario: number, mediaReferencia: number) {
  if (!Number.isFinite(mediaReferencia) || mediaReferencia <= 0) return "OK" as const;
  if (valorUnitario > mediaReferencia * 1.5) return "SOBREPRECO" as const;
  if (valorUnitario < mediaReferencia * 0.5) return "INEXEQUIVEL" as const;
  return "OK" as const;
}

function calculateMedian(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
}

function buildAutomaticTrDraft({
  processo,
  dfdRow,
  etpRow,
  trRow,
  itens,
  mapaComparativo,
}: {
  processo: any;
  dfdRow: any;
  etpRow: any;
  trRow: any;
  itens: any[];
  mapaComparativo: any[];
}) {
  const metodologiaCodigo = (etpRow?.metodologiaCotacao ?? "MEDIA") as keyof typeof metodologiaCotacaoLabels;
  const metodologiaNome = metodologiaCotacaoLabels[metodologiaCodigo] ?? "Média";
  const itensComReferencia = mapaComparativo.filter((item) => item.totalCotacoes > 0);
  const quantidadeItens = itens.length;
  const quantidadeReferencias = itensComReferencia.length;
  const valorEstimadoFormatado = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(toNumber(processo.valorEstimado));
  const orcamentoSigiloso = Boolean(trRow?.orcamentoSigiloso ?? false);

  return {
    id: trRow?.id ?? null,
    processoId: processo.id,
    objetoTermo:
      trRow?.objetoTermo ??
      processo.objeto,
    fundamentacaoContratacao:
      trRow?.fundamentacaoContratacao ??
      [
        `A presente contratação decorre da demanda formalizada na DFD do processo ${processo.numeroSirel}.`,
        dfdRow?.justificativa ?? "A motivação da contratação está registrada na DFD da fase de Planejamento.",
        `O ETP foi tratado por anexo externo e a consolidação econômica utilizou a metodologia ${metodologiaNome.toLowerCase()}.`,
      ].join("\n\n"),
    descricaoSolucao:
      trRow?.descricaoSolucao ??
      `A solução proposta contempla ${quantidadeItens} item(ns) definidos na DFD, com ${quantidadeReferencias} item(ns) já consolidados por cotações preliminares válidas.`,
    requisitosContratacao:
      trRow?.requisitosContratacao ??
      "O futuro contratado deverá atender às especificações técnicas do processo, observar os requisitos de qualidade, prazo, habilitação e execução definidos nos documentos da fase de Planejamento.",
    modeloExecucao:
      trRow?.modeloExecucao ??
      "A execução observará as condições estabelecidas no processo administrativo, no ETP externo anexado e nos documentos complementares do Planejamento.",
    criteriosMedicaoPagamento:
      trRow?.criteriosMedicaoPagamento ??
      "A medição e o pagamento deverão observar a efetiva entrega do objeto, a conferência administrativa e as condições de liquidação definidas no processo.",
    adequacaoOrcamentaria:
      trRow?.adequacaoOrcamentaria ??
      (orcamentoSigiloso
        ? "O orçamento estimado da contratação possui caráter sigiloso nesta fase, permanecendo resguardado até o momento processual adequado, sem prejuízo da correspondente adequação orçamentária."
        : `O valor estimado consolidado nesta etapa é de ${valorEstimadoFormatado}, sujeito à confirmação da reserva e da adequação orçamentária no fluxo subsequente.`),
    orcamentoSigiloso,
    observacoes: trRow?.observacoes ?? null,
    concluido: trRow?.concluido ?? false,
    criadoEm: trRow?.criadoEm ?? null,
    atualizadoEm: trRow?.atualizadoEm ?? null,
    geradoAutomaticamente: !trRow,
  };
}

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

async function syncProcessoEstimativasFromEtp(processoId: number) {
  const db = requireDb();
  const [etpRow] = await db
    .select({ id: etp.id, metodologiaCotacao: etp.metodologiaCotacao })
    .from(etp)
    .where(eq(etp.processoId, processoId))
    .limit(1);
  const itens = await db
    .select({
      id: itensProcesso.id,
      quantidade: itensProcesso.quantidade,
    })
    .from(itensProcesso)
    .where(eq(itensProcesso.processoId, processoId));

  if (!itens.length) {
    await db.update(processos).set({ valorEstimado: null, atualizadoEm: new Date() }).where(eq(processos.id, processoId));
    return;
  }

  if (!etpRow) {
    await Promise.all(
      itens.map((item) =>
        db
          .update(itensProcesso)
          .set({
            valorUnitarioEstimado: null,
            valorTotalEstimado: null,
            atualizadoEm: new Date(),
          })
          .where(eq(itensProcesso.id, item.id)),
      ),
    );
    await db.update(processos).set({ valorEstimado: null, atualizadoEm: new Date() }).where(eq(processos.id, processoId));
    return;
  }

  const cotacoes = await db
    .select({
      itemId: etpCotacoesPreliminares.itemId,
      valorUnitario: etpCotacoesPreliminares.valorUnitario,
      considerada: etpCotacoesPreliminares.considerada,
    })
    .from(etpCotacoesPreliminares)
    .where(eq(etpCotacoesPreliminares.etpId, etpRow.id));

  const totalPorProcesso: number[] = [];

  await Promise.all(
    itens.map(async (item) => {
      const cotacoesDoItem = cotacoes.filter((cotacao) => cotacao.itemId === item.id && cotacao.considerada);
      if (!cotacoesDoItem.length) {
        await db
          .update(itensProcesso)
          .set({
            valorUnitarioEstimado: null,
            valorTotalEstimado: null,
            atualizadoEm: new Date(),
          })
          .where(eq(itensProcesso.id, item.id));
        return;
      }

      const valores = cotacoesDoItem.map((cotacao) => toNumber(cotacao.valorUnitario));
      const menorPreco = Math.min(...valores);
      const mediaUnitaria = valores.reduce((acc, current) => acc + current, 0) / valores.length;
      const medianaUnitaria = calculateMedian(valores);
      const referenciaUnitaria =
        etpRow.metodologiaCotacao === "MENOR_PRECO"
          ? menorPreco
          : etpRow.metodologiaCotacao === "MEDIANA"
            ? medianaUnitaria
            : mediaUnitaria;
      const valorTotal = referenciaUnitaria * toNumber(item.quantidade);
      totalPorProcesso.push(valorTotal);

      await db
        .update(itensProcesso)
        .set({
          valorUnitarioEstimado: referenciaUnitaria.toFixed(2),
          valorTotalEstimado: valorTotal.toFixed(2),
          atualizadoEm: new Date(),
        })
        .where(eq(itensProcesso.id, item.id));
    }),
  );

  const valorEstimado = totalPorProcesso.length
    ? totalPorProcesso.reduce((acc, current) => acc + current, 0).toFixed(2)
    : null;

  await db
    .update(processos)
    .set({
      valorEstimado,
      atualizadoEm: new Date(),
    })
    .where(eq(processos.id, processoId));
}

async function loadPlanejamentoDetail(processoId: number) {
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
      valorEstimado: processos.valorEstimado,
    })
    .from(processos)
    .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
    .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
    .where(eq(processos.id, processoId))
    .limit(1);

  if (!processo) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
  }

  const [dfdRow, etpRow, trRow] = await Promise.all([
    db.select().from(dfd).where(eq(dfd.processoId, processoId)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(etp).where(eq(etp.processoId, processoId)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(tr).where(eq(tr.processoId, processoId)).limit(1).then((rows) => rows[0] ?? null),
  ]);

  const [atendente, solicitante, secretariaDemandante, secretariaResponsavel, assinaturaResponsavel, responsaveis, secretariasParticipantes, itens, cotacoesPreliminares] = await Promise.all([
    dfdRow?.solicitanteUserId
      ? db
          .select({ id: users.id, name: users.name, username: users.username, email: users.email })
          .from(users)
          .where(eq(users.id, dfdRow.solicitanteUserId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    dfdRow?.solicitantePessoaId
      ? db
          .select({ id: pessoas.id, nome: pessoas.nome, cargo: pessoas.cargo, secretariaId: pessoas.secretariaId })
          .from(pessoas)
          .where(eq(pessoas.id, dfdRow.solicitantePessoaId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    dfdRow?.secretariaDemandanteId
      ? db
          .select({ id: secretarias.id, nome: secretarias.nome, sigla: secretarias.sigla })
          .from(secretarias)
          .where(eq(secretarias.id, dfdRow.secretariaDemandanteId))
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
    dfdRow?.assinaturaResponsavelId
      ? db
          .select({ id: pessoas.id, nome: pessoas.nome, cargo: pessoas.cargo, secretariaId: pessoas.secretariaId })
          .from(pessoas)
          .where(eq(pessoas.id, dfdRow.assinaturaResponsavelId))
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
        catalogoItemId: itensProcesso.catalogoItemId,
        numeroItem: itensProcesso.numeroItem,
        descricao: itensProcesso.descricao,
        quantidade: itensProcesso.quantidade,
        unidade: itensProcesso.unidade,
        valorUnitarioEstimado: itensProcesso.valorUnitarioEstimado,
        valorTotalEstimado: itensProcesso.valorTotalEstimado,
      })
      .from(itensProcesso)
      .where(eq(itensProcesso.processoId, processoId))
      .orderBy(asc(itensProcesso.numeroItem)),
    etpRow
      ? db
          .select({
            id: etpCotacoesPreliminares.id,
            itemId: etpCotacoesPreliminares.itemId,
            numeroItem: itensProcesso.numeroItem,
            itemDescricao: itensProcesso.descricao,
            itemQuantidade: itensProcesso.quantidade,
            itemUnidade: itensProcesso.unidade,
            fonte: etpCotacoesPreliminares.fonte,
            fornecedorNome: etpCotacoesPreliminares.fornecedorNome,
            documento: etpCotacoesPreliminares.documento,
            dataCotacao: etpCotacoesPreliminares.dataCotacao,
            quantidadeConsiderada: etpCotacoesPreliminares.quantidadeConsiderada,
            valorUnitario: etpCotacoesPreliminares.valorUnitario,
            valorTotal: etpCotacoesPreliminares.valorTotal,
            considerada: etpCotacoesPreliminares.considerada,
            motivoDesconsideracao: etpCotacoesPreliminares.motivoDesconsideracao,
            justificativaDesconsideracao: etpCotacoesPreliminares.justificativaDesconsideracao,
            observacao: etpCotacoesPreliminares.observacao,
            atualizadoEm: etpCotacoesPreliminares.atualizadoEm,
          })
          .from(etpCotacoesPreliminares)
          .innerJoin(itensProcesso, eq(itensProcesso.id, etpCotacoesPreliminares.itemId))
          .where(eq(etpCotacoesPreliminares.etpId, etpRow.id))
          .orderBy(asc(itensProcesso.numeroItem), asc(etpCotacoesPreliminares.fornecedorNome), desc(etpCotacoesPreliminares.atualizadoEm))
      : Promise.resolve([]),
  ]);

  const cotacoesComAnalise = cotacoesPreliminares.map((cotacao) => {
    const cotacoesDoItem = cotacoesPreliminares.filter((entry) => entry.itemId === cotacao.itemId);
    const mediaItem =
      cotacoesDoItem.reduce((acc, entry) => acc + toNumber(entry.valorUnitario), 0) / (cotacoesDoItem.length || 1);
    return {
      ...cotacao,
      analiseFaixa: classifyQuoteAgainstAverage(toNumber(cotacao.valorUnitario), mediaItem),
    };
  });

  const mapaComparativo = itens.map((item) => {
    const cotacoesDoItem = cotacoesComAnalise.filter((cotacao) => cotacao.itemId === item.id && cotacao.considerada);
    if (!cotacoesDoItem.length) {
      return {
        itemId: item.id,
        numeroItem: item.numeroItem,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        totalCotacoes: 0,
        metodologiaCotacao: etpRow?.metodologiaCotacao ?? "MEDIA",
        menorValorUnitario: null,
        maiorValorUnitario: null,
        valorMedioUnitario: null,
        valorMedianoUnitario: null,
        valorSelecionadoUnitario: null,
        valorReferenciaTotal: null,
      };
    }

    const valores = cotacoesDoItem.map((cotacao) => toNumber(cotacao.valorUnitario)).sort((left, right) => left - right);
    const media = valores.reduce((acc, current) => acc + current, 0) / valores.length;
    const mediana = calculateMedian(valores);
    const quantidade = toNumber(item.quantidade);
    const valorSelecionado =
      (etpRow?.metodologiaCotacao ?? "MEDIA") === "MENOR_PRECO"
        ? valores[0]
        : (etpRow?.metodologiaCotacao ?? "MEDIA") === "MEDIANA"
          ? mediana
          : media;

    return {
      itemId: item.id,
      numeroItem: item.numeroItem,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      totalCotacoes: cotacoesDoItem.length,
      metodologiaCotacao: etpRow?.metodologiaCotacao ?? "MEDIA",
      menorValorUnitario: valores[0].toFixed(2),
      maiorValorUnitario: valores[valores.length - 1].toFixed(2),
      valorMedioUnitario: media.toFixed(2),
      valorMedianoUnitario: mediana.toFixed(2),
      valorSelecionadoUnitario: valorSelecionado.toFixed(2),
      valorReferenciaTotal: (valorSelecionado * quantidade).toFixed(2),
    };
  });

  const trDraft = buildAutomaticTrDraft({
    processo,
    dfdRow,
    etpRow,
    trRow,
    itens,
    mapaComparativo,
  });

  return {
    processo,
    dfd: dfdRow
      ? {
          ...dfdRow,
          atendente,
          solicitante,
          secretariaDemandante,
          secretariaResponsavel,
          assinaturaResponsavel,
          responsaveis,
          secretariasParticipantes,
        }
      : null,
    etp: etpRow,
    tr: trDraft,
    itens,
    cotacoesPreliminares: cotacoesComAnalise,
    mapaComparativo,
  };
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
        etpId: etp.id,
        etpConcluido: etp.concluido,
        trId: tr.id,
        trConcluido: tr.concluido,
        atualizadoEm: workflowProcesso.atualizadoEm,
        grauPrioridade: dfd.grauPrioridade,
        demandaSistemica: dfd.demandaSistemica,
      })
      .from(workflowProcesso)
      .innerJoin(processos, eq(processos.id, workflowProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(dfd, eq(dfd.processoId, processos.id))
      .leftJoin(etp, eq(etp.processoId, processos.id))
      .leftJoin(tr, eq(tr.processoId, processos.id))
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

    const cotacoesCountRows = processoIds.length
      ? await db
          .select({ processoId: etp.processoId, total: count() })
          .from(etpCotacoesPreliminares)
          .innerJoin(etp, eq(etp.id, etpCotacoesPreliminares.etpId))
          .where(inArray(etp.processoId, processoIds))
          .groupBy(etp.processoId)
      : [];
    const cotacoesMap = new Map(cotacoesCountRows.map((row) => [row.processoId, Number(row.total)]));

    return rows.map((row) => ({
      ...row,
      itensCount: itemMap.get(row.processoId) ?? 0,
      cotacoesCount: cotacoesMap.get(row.processoId) ?? 0,
    }));
  }),

  detail: publicProcedure.input(z.object({ processoId: z.number().int().positive() })).query(async ({ input }) => {
    return loadPlanejamentoDetail(input.processoId);
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
    const secretariaResponsavelId = input.demandaSistemica ? await resolveSecretariaAdministracaoId() : input.secretariaResponsavelId;
    const [itemCountRow] = await db.select({ total: count() }).from(itensProcesso).where(eq(itensProcesso.processoId, input.processoId));
    const itensRegistrados = Number(itemCountRow?.total ?? 0);

    const [[secretariaDemandante], [secretariaResponsavel], [solicitante]] = await Promise.all([
      db
        .select({ id: secretarias.id, nome: secretarias.nome })
        .from(secretarias)
        .where(eq(secretarias.id, input.secretariaDemandanteId))
        .limit(1),
      db
        .select({ id: secretarias.id, nome: secretarias.nome })
        .from(secretarias)
        .where(eq(secretarias.id, secretariaResponsavelId))
        .limit(1),
      db
        .select({ id: pessoas.id, nome: pessoas.nome })
        .from(pessoas)
        .where(eq(pessoas.id, input.solicitanteId))
        .limit(1),
    ]);

    if (!secretariaDemandante || !secretariaResponsavel || !solicitante) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Solicitante e secretarias da DFD devem estar cadastrados antes do salvamento.",
      });
    }

    if (input.concluir && itensRegistrados <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Adicione ao menos um item na selecao de itens da DFD antes de concluir.",
      });
    }

    const payload = {
      setorDemandante: secretariaDemandante.nome,
      secretariaDemandanteId: input.secretariaDemandanteId,
      grauPrioridade: input.grauPrioridade,
      demandaSistemica: input.demandaSistemica,
      justificativa: input.justificativa,
      dataNecessidade: input.dataNecessidade,
      dataPrevistaConclusao: input.dataPrevistaConclusao,
      observacoes: input.observacoes ?? null,
      secretariaResponsavelId,
      solicitantePessoaId: input.solicitanteId,
      solicitanteUserId: ctx.user?.id ?? existingDfd?.solicitanteUserId ?? null,
      assinaturaResponsavelId: input.assinaturaResponsavelId,
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
      catalogoItemId: existingItem?.catalogoItemId ?? null,
      descricao: input.descricao,
      quantidade: input.quantidade.toString(),
      unidade: input.unidade,
      valorUnitarioEstimado: existingItem?.valorUnitarioEstimado ?? null,
      valorTotalEstimado: existingItem?.valorTotalEstimado ?? null,
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

    await syncProcessoEstimativasFromEtp(input.processoId);

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
    await syncProcessoEstimativasFromEtp(input.processoId);

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

    const [processo, existingEtp, existingTr] = await Promise.all([
      db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(etp).where(eq(etp.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(tr).where(eq(tr.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
    ]);
    const itensRemovidos = await db.select().from(itensProcesso).where(eq(itensProcesso.processoId, input.processoId));

    await db.delete(itensProcesso).where(eq(itensProcesso.processoId, input.processoId));
    if (existingEtp) {
      await db.delete(etp).where(eq(etp.id, existingEtp.id));
    }
    if (existingTr) {
      await db.delete(tr).where(eq(tr.id, existingTr.id));
    }
    await db.delete(dfd).where(eq(dfd.id, existingDfd.id));
    await db.update(processos).set({ valorEstimado: null, atualizadoEm: new Date() }).where(eq(processos.id, input.processoId));

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
      observacao: "DFD, ETP e itens vinculados removidos para reinicio da etapa.",
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "dfd",
      registroId: existingDfd.id,
      acao: "DELETE",
      dadosAnteriores: { ...existingDfd, etp: existingEtp, tr: existingTr, itensRemovidos },
      descricao: `DFD do processo ${processo?.numeroSirel ?? input.processoId} excluida`,
    });

    return { success: true };
  }),

  saveEtp: gestorProcedure.input(etpSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [processo, dfdRow, existingEtp, etpDocumentoRow] = await Promise.all([
      db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select({ id: dfd.id, concluido: dfd.concluido }).from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(etp).where(eq(etp.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db
        .select({ id: documentos.id })
        .from(documentos)
        .where(and(eq(documentos.processoId, input.processoId), eq(documentos.categoria, "ETP_EXTERNO")))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    if (!processo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
    }
    if (!dfdRow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Conclua a DFD antes de iniciar o ETP." });
    }
    if (input.concluir && !etpDocumentoRow) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Anexe o documento principal do ETP antes de concluir esta etapa.",
      });
    }

    const payload = {
      metodologiaCotacao: input.metodologiaCotacao,
      descricaoNecessidade: input.descricaoNecessidade?.trim() || null,
      analiseSolucoesMercado: input.analiseSolucoesMercado?.trim() || null,
      justificativaTecnica: input.justificativaTecnica?.trim() || null,
      providenciasPrevias: input.providenciasPrevias?.trim() || null,
      conclusaoViabilidade: input.conclusaoViabilidade?.trim() || null,
      observacoes: input.observacoes ?? null,
      concluido: input.concluir,
      atualizadoEm: new Date(),
    };

    const [saved] = existingEtp
      ? await db.update(etp).set(payload).where(eq(etp.id, existingEtp.id)).returning()
      : await db
          .insert(etp)
          .values({
            processoId: input.processoId,
            criadoEm: new Date(),
            ...payload,
          })
          .returning();

    await syncProcessoEstimativasFromEtp(input.processoId);

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: input.concluir ? "ETP externo anexado" : "ETP externo em elaboracao",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: existingEtp ? "Configuracao do ETP atualizada" : "ETP externo iniciado no Planejamento",
      observacao: input.concluir
        ? "Documentos do ETP anexados e etapa marcada como concluida."
        : "Etapa do ETP externo salva em elaboracao.",
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "etp",
      registroId: saved.id,
      acao: existingEtp ? "UPDATE" : "CREATE",
      dadosAnteriores: existingEtp ?? null,
      dadosNovos: saved,
      descricao: `ETP do processo ${processo.numeroSirel} ${existingEtp ? "atualizado" : "criado"} como anexo externo`,
    });

    return saved;
  }),

  saveCotacaoPreliminar: gestorProcedure.input(etpCotacaoSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [processo, etpRow, item] = await Promise.all([
      db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(etp).where(eq(etp.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db
        .select({
          id: itensProcesso.id,
          numeroItem: itensProcesso.numeroItem,
          quantidade: itensProcesso.quantidade,
        })
        .from(itensProcesso)
        .where(and(eq(itensProcesso.id, input.itemId), eq(itensProcesso.processoId, input.processoId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    if (!processo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
    }
    if (!etpRow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Salve o ETP antes de registrar cotacoes preliminares." });
    }
    if (!item) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Item nao encontrado para este processo." });
    }

    const [existingCotacao] = input.cotacaoId
      ? await db
          .select()
          .from(etpCotacoesPreliminares)
          .where(and(eq(etpCotacoesPreliminares.id, input.cotacaoId), eq(etpCotacoesPreliminares.etpId, etpRow.id)))
          .limit(1)
      : [];

    if (input.cotacaoId && !existingCotacao) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cotacao preliminar nao encontrada." });
    }

    const valorTotal = input.quantidadeConsiderada * input.valorUnitario;
    const payload = {
      itemId: input.itemId,
      fonte: input.fonte,
      fornecedorNome: input.fornecedorNome,
      documento: input.documento ?? null,
      dataCotacao: input.dataCotacao ?? null,
      quantidadeConsiderada: input.quantidadeConsiderada.toString(),
      valorUnitario: input.valorUnitario.toFixed(2),
      valorTotal: valorTotal.toFixed(2),
      considerada: input.considerada,
      motivoDesconsideracao: input.considerada ? null : input.motivoDesconsideracao ?? null,
      justificativaDesconsideracao: input.considerada ? null : input.justificativaDesconsideracao ?? null,
      observacao: input.observacao ?? null,
      atualizadoEm: new Date(),
    };

    const [saved] = existingCotacao
      ? await db.update(etpCotacoesPreliminares).set(payload).where(eq(etpCotacoesPreliminares.id, existingCotacao.id)).returning()
      : await db
          .insert(etpCotacoesPreliminares)
          .values({
            etpId: etpRow.id,
            criadoEm: new Date(),
            ...payload,
          })
          .returning();

    await syncProcessoEstimativasFromEtp(input.processoId);

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: "Cotacoes preliminares em elaboracao",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: existingCotacao ? "Cotacao preliminar atualizada" : "Cotacao preliminar registrada",
      observacao: input.considerada
        ? `Item ${item.numeroItem} com cotacao preliminar considerada no mapa comparativo.`
        : `Item ${item.numeroItem} com cotacao preliminar desconsiderada mediante justificativa.`,
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "etp_cotacoes_preliminares",
      registroId: saved.id,
      acao: existingCotacao ? "UPDATE" : "CREATE",
      dadosAnteriores: existingCotacao ?? null,
      dadosNovos: saved,
      descricao: `Cotacao preliminar do item ${item.numeroItem} no processo ${processo.numeroSirel} ${existingCotacao ? "atualizada" : "criada"}`,
    });

    return saved;
  }),

  deleteCotacaoPreliminar: gestorProcedure.input(etpCotacaoDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [etpRow] = await db.select({ id: etp.id }).from(etp).where(eq(etp.processoId, input.processoId)).limit(1);
    if (!etpRow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nao ha ETP registrado para este processo." });
    }

    const [existingCotacao] = await db
      .select()
      .from(etpCotacoesPreliminares)
      .where(and(eq(etpCotacoesPreliminares.id, input.cotacaoId), eq(etpCotacoesPreliminares.etpId, etpRow.id)))
      .limit(1);

    if (!existingCotacao) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cotacao preliminar nao encontrada." });
    }

    await db.delete(etpCotacoesPreliminares).where(eq(etpCotacoesPreliminares.id, input.cotacaoId));
    await syncProcessoEstimativasFromEtp(input.processoId);

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: "Cotacao preliminar removida",
      observacao: "Registro removido da etapa de cotacoes preliminares.",
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "etp_cotacoes_preliminares",
      registroId: existingCotacao.id,
      acao: "DELETE",
      dadosAnteriores: existingCotacao,
      descricao: `Cotacao preliminar ${existingCotacao.id} removida do processo ${input.processoId}`,
    });

    return { success: true };
  }),

  saveTr: gestorProcedure.input(trSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [processo, dfdRow, etpRow, existingTr, trDocumentoRow] = await Promise.all([
      db.select().from(processos).where(eq(processos.id, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(dfd).where(eq(dfd.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(etp).where(eq(etp.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(tr).where(eq(tr.processoId, input.processoId)).limit(1).then((rows) => rows[0] ?? null),
      db
        .select({ id: documentos.id })
        .from(documentos)
        .where(and(eq(documentos.processoId, input.processoId), eq(documentos.categoria, "TR_EXTERNO")))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    if (!processo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
    }
    if (!dfdRow?.concluido) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Conclua a DFD antes de registrar o TR." });
    }
    if (!etpRow?.concluido) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Conclua o ETP antes de registrar o TR." });
    }

    const detail = await loadPlanejamentoDetail(input.processoId);
    const itensComReferencia = detail.mapaComparativo.filter((item) => item.totalCotacoes > 0);
    if (input.concluir && !trDocumentoRow) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Anexe o documento principal do TR antes de concluir esta etapa.",
      });
    }
    if (input.concluir && !itensComReferencia.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Registre cotações preliminares válidas antes de concluir o TR.",
      });
    }

    const trBase = detail.tr;
    const payload = {
      objetoTermo: trBase.objetoTermo,
      fundamentacaoContratacao: trBase.fundamentacaoContratacao,
      descricaoSolucao: trBase.descricaoSolucao,
      requisitosContratacao: trBase.requisitosContratacao,
      modeloExecucao: trBase.modeloExecucao?.trim() || null,
      criteriosMedicaoPagamento: trBase.criteriosMedicaoPagamento?.trim() || null,
      adequacaoOrcamentaria: trBase.adequacaoOrcamentaria?.trim() || null,
      orcamentoSigiloso: input.orcamentoSigiloso,
      observacoes: input.observacoes?.trim() || null,
      concluido: input.concluir,
      atualizadoEm: new Date(),
    };

    const [saved] = existingTr
      ? await db.update(tr).set(payload).where(eq(tr.id, existingTr.id)).returning()
      : await db
          .insert(tr)
          .values({
            processoId: input.processoId,
            criadoEm: new Date(),
            ...payload,
          })
          .returning();

    await db
      .update(workflowProcesso)
      .set({
        etapaAtual: input.concluir ? "TR externo anexado" : "TR externo em elaboração",
        situacao: "EM_ANDAMENTO",
        atualizadoEm: new Date(),
      })
      .where(eq(workflowProcesso.processoId, input.processoId));

    await db.insert(movimentacoesWorkflow).values({
      processoId: input.processoId,
      moduloOrigem: "PLANEJAMENTO",
      moduloDestino: "PLANEJAMENTO",
      descricao: existingTr ? "Configuração do TR atualizada" : "TR externo iniciado no Planejamento",
      observacao: input.concluir
        ? "Documento principal do TR anexado e etapa marcada como concluída."
        : "Etapa do TR externo salva em elaboração.",
      usuarioId: ctx.user?.id ?? null,
      criadoEm: new Date(),
    });

    await logAuditoria(ctx, {
      tabela: "tr",
      registroId: saved.id,
      acao: existingTr ? "UPDATE" : "CREATE",
      dadosAnteriores: existingTr ?? null,
      dadosNovos: saved,
      descricao: `TR do processo ${processo.numeroSirel} ${existingTr ? "atualizado" : "criado"} como etapa com anexo externo`,
    });

    return saved;
  }),

  generateDocumento: gestorProcedure.input(planejamentoDocumentoGenerateInputSchema).mutation(async ({ ctx, input }) => {
    const detail = await loadPlanejamentoDetail(input.processoId);

    if (input.documento === "DFD" && !detail.dfd) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Registre a DFD antes de gerar o documento." });
    }
    if (input.documento === "MAPA_COMPARATIVO" && !detail.etp) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Registre o ETP e as cotacoes preliminares antes de gerar o mapa." });
    }
    if (input.documento === "TR" && (!detail.dfd || !detail.etp)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Conclua DFD e ETP antes de gerar o documento-base do TR." });
    }

    const created = await saveGeneratedPlanejamentoDocumento({
      ctx,
      processoId: input.processoId,
      documento: input.documento,
      formato: input.formato,
      detail,
    });

    await logAuditoria(ctx, {
      tabela: "documentos",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `${input.documento} em ${input.formato} gerado e persistido no acervo do processo ${detail.processo.numeroSirel}`,
    });

    return created;
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
        catalogoItemId: item.catalogoItemId,
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

