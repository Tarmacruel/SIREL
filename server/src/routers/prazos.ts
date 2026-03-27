import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";

import {
  agendaShareCreateInputSchema,
  agendaShareResolveInputSchema,
  agendaSharedCommentInputSchema,
  agendaSharedListInputSchema,
  prazoAgendaListInputSchema,
  prazoConcluirInputSchema,
  prazoDeleteInputSchema,
  prazoListInputSchema,
  prazoSaveInputSchema,
  tarefaEquipeBulkInputSchema,
  tarefaEquipeDeleteInputSchema,
  tarefaEquipeSaveInputSchema,
  tarefaEquipeStatusInputSchema,
} from "@sirel/shared/schemas/prazos";

import { logAuditoria } from "../db/auditoria.js";
import { sanitizeLegacyText } from "../lib/legacy-text-normalizer.js";
import { requireDb } from "../db/client.js";
import { prazosAgendaCompartilhamentos, processos, prazosProcessuais, secretarias, tarefasEquipe, users } from "../db/schema.js";
import { dispatchNotifications } from "../lib/notificacoes-dispatch.js";
import { operadorProcedure, publicProcedure, router } from "../trpc.js";

type PrazoProcessualInsert = typeof prazosProcessuais.$inferInsert;
type TarefaEquipeInsert = typeof tarefasEquipe.$inferInsert;

type SystemNotificationPayload = {
  userId: number;
  chave: string;
  titulo: string;
  mensagem: string;
  prioridade?: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  processoId?: number | null;
  prazoId?: number | null;
  href?: string | null;
};

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function diffInDays(target: Date) {
  const today = startOfDay();
  return Math.round((startOfDay(target).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function resolvePrazoStatus(row: { status: string; dataPrevista: Date; dataRealizada: Date | null }) {
  if (row.dataRealizada || row.status === "CONCLUIDO") return "CONCLUIDO";
  return row.dataPrevista < startOfDay() ? "EM_ATRASO" : "PENDENTE";
}

function buildPrazoView(row: any) {
  const status = resolvePrazoStatus(row);
  const dataPrevista = row.dataPrevista instanceof Date ? row.dataPrevista : new Date(row.dataPrevista);
  const daysRemaining = status === "CONCLUIDO" ? null : diffInDays(dataPrevista);
  const alertLevel =
    status === "EM_ATRASO"
      ? "error"
      : daysRemaining === 0
        ? "critical"
        : daysRemaining !== null && daysRemaining <= 2
          ? "warning"
          : daysRemaining !== null && daysRemaining <= 7
            ? "info"
            : "normal";

  return {
    ...row,
    status,
    daysRemaining,
    alertLevel,
  };
}

function parseDateValue(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveTaskStatus(row: { status: string; concluidaEm: Date | null }) {
  if (row.concluidaEm || row.status === "CONCLUIDO") return "CONCLUIDO";
  return row.status;
}

function buildTaskView(row: any, userNames: Map<number, string>) {
  const status = resolveTaskStatus(row);
  const dataEntrega = parseDateValue(row.dataEntrega);
  const daysRemaining = status === "CONCLUIDO" || !dataEntrega ? null : diffInDays(dataEntrega);
  const alertLevel =
    status === "CONCLUIDO"
      ? "success"
      : status === "BLOQUEADO"
        ? "error"
        : daysRemaining !== null && daysRemaining < 0
          ? "error"
          : daysRemaining === 0
            ? "critical"
            : daysRemaining !== null && daysRemaining <= 2
              ? "warning"
              : daysRemaining !== null && daysRemaining <= 7
                ? "info"
                : "normal";

  return {
    ...row,
    itemTipo: "TAREFA_EQUIPE" as const,
    status,
    daysRemaining,
    alertLevel,
    tipo: null,
    prazoId: row.prazoId ?? null,
    prioridade: row.prioridade,
    dataPrevista: row.dataEntrega,
    dataLimite: row.dataEntrega,
    dataRealizada: row.concluidaEm ?? null,
    responsavelNome: row.responsavelId ? userNames.get(row.responsavelId) ?? null : null,
    delegadoPorNome: row.delegadoPorId ? userNames.get(row.delegadoPorId) ?? null : null,
    observacao: row.descricao ?? null,
    notificarResponsavel: Boolean(row.notificarResponsavel),
  };
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sanitizeAgendaText(value: unknown) {
  return typeof value === "string" ? sanitizeLegacyText(value) : value;
}

function sanitizeAgendaItem(item: any) {
  return {
    ...item,
    titulo: sanitizeAgendaText(item.titulo),
    objeto: sanitizeAgendaText(item.objeto),
    secretariaNome: sanitizeAgendaText(item.secretariaNome),
    observacao: sanitizeAgendaText(item.observacao),
    numeroSirel: sanitizeAgendaText(item.numeroSirel),
  };
}

function matchesAgendaSearch(item: any, search: string) {
  const needle = normalizeText(search);
  if (!needle) return true;
  const fields = [
    item.titulo,
    item.numeroSirel,
    item.objeto,
    item.secretariaNome,
    item.responsavelNome,
    item.delegadoPorNome,
    item.observacao,
  ];
  return fields.some((entry) => normalizeText(entry).includes(needle));
}

function isItemOverdue(item: any) {
  return item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining < 0;
}

function isItemCritical(item: any) {
  return item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining <= 2;
}

function compareAgendaItems(left: any, right: any) {
  const leftDone = left.status === "CONCLUIDO";
  const rightDone = right.status === "CONCLUIDO";
  if (leftDone !== rightDone) return leftDone ? 1 : -1;

  const leftDays = left.daysRemaining ?? 9999;
  const rightDays = right.daysRemaining ?? 9999;
  if (leftDays !== rightDays) return leftDays - rightDays;

  const leftDate = parseDateValue(left.dataLimite ?? left.dataPrevista)?.getTime() ?? 0;
  const rightDate = parseDateValue(right.dataLimite ?? right.dataPrevista)?.getTime() ?? 0;
  if (leftDate !== rightDate) return leftDate - rightDate;

  return left.id - right.id;
}

function filterAgendaItems(items: any[], input: any, contextUserId: number | null) {
  let filtered = [...items];

  if (input.escopo === "MEUS_PRAZOS") {
    if (!contextUserId) {
      filtered = [];
    } else {
      filtered = filtered.filter(
        (item: any) =>
          item.responsavelId === contextUserId ||
          item.delegadoPorId === contextUserId ||
          (item.itemTipo === "PRAZO_PROCESSUAL" && item.criadoPor === contextUserId),
      );
    }
  }
  if (input.escopo === "TAREFAS_EQUIPE") {
    filtered = filtered.filter((item: any) => item.itemTipo === "TAREFA_EQUIPE");
  }
  if (input.escopo === "ALERTAS") {
    filtered = filtered.filter((item: any) => isItemCritical(item) || isItemOverdue(item));
  }

  if (input.itemTipo) filtered = filtered.filter((item: any) => item.itemTipo === input.itemTipo);
  if (input.processoId) filtered = filtered.filter((item: any) => item.processoId === input.processoId);
  if (input.prazoTipo) filtered = filtered.filter((item: any) => item.itemTipo === "PRAZO_PROCESSUAL" && item.tipo === input.prazoTipo);
  if (input.statusPrazo) filtered = filtered.filter((item: any) => item.itemTipo === "PRAZO_PROCESSUAL" && item.status === input.statusPrazo);
  if (input.statusTarefa) filtered = filtered.filter((item: any) => item.itemTipo === "TAREFA_EQUIPE" && item.status === input.statusTarefa);
  if (input.prioridadeTarefa) filtered = filtered.filter((item: any) => item.itemTipo === "TAREFA_EQUIPE" && item.prioridade === input.prioridadeTarefa);
  if (input.responsavelId) filtered = filtered.filter((item: any) => item.responsavelId === input.responsavelId);
  if (input.somenteCriticos) filtered = filtered.filter((item: any) => isItemCritical(item) || isItemOverdue(item));
  if (input.ocultarConcluidos) filtered = filtered.filter((item: any) => item.status !== "CONCLUIDO");
  if (input.somenteDelegadosPorMim) {
    if (!contextUserId) {
      filtered = [];
    } else {
      filtered = filtered.filter((item: any) => item.itemTipo === "TAREFA_EQUIPE" && item.delegadoPorId === contextUserId);
    }
  }
  if (input.somenteMeusItens) {
    if (!contextUserId) {
      filtered = [];
    } else {
      filtered = filtered.filter(
        (item: any) =>
          item.responsavelId === contextUserId ||
          item.delegadoPorId === contextUserId ||
          (item.itemTipo === "PRAZO_PROCESSUAL" && item.criadoPor === contextUserId),
      );
    }
  }
  if (input.busca) {
    filtered = filtered.filter((item: any) => matchesAgendaSearch(item, input.busca ?? ""));
  }

  filtered.sort(compareAgendaItems);
  return filtered;
}

function startOfWeek(value = new Date()) {
  const date = startOfDay(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return date;
}

function endOfWeek(value = new Date()) {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

async function upsertSystemNotifications(db: any, payloads: SystemNotificationPayload[]) {
  const dedupe = new Set<string>();
  const validPayloads = payloads.filter((payload) => {
    if (!payload.userId || !payload.chave) return false;
    const key = `${payload.userId}:${payload.chave}`;
    if (dedupe.has(key)) return false;
    dedupe.add(key);
    return true;
  });

  if (!validPayloads.length) return;

  await dispatchNotifications(
    db,
    validPayloads.map((payload) => ({
      ...payload,
      tipo: "SISTEMA" as const,
      href: payload.href ?? "/prazos",
      origemAutomatica: true,
      scope: "MEUS_ITENS" as const,
    })),
    { scope: "MEUS_ITENS" },
  );
}

function appendTextBlock(base: string | null | undefined, addition: string | null | undefined) {
  const trimmedAddition = addition?.trim();
  if (!trimmedAddition) return base ?? null;
  const trimmedBase = base?.trim();
  return trimmedBase ? `${trimmedBase}\n${trimmedAddition}` : trimmedAddition;
}

async function loadUserNames(db: any, rawIds: Array<number | null | undefined>): Promise<Map<number, string>> {
  const ids = Array.from(
    new Set(
      rawIds.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0),
    ),
  );
  if (!ids.length) return new Map<number, string>();

  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map<number, string>(rows.map((row: any) => [row.id, row.name]));
}

async function loadAgendaItems(db: any) {
  const [prazoRows, tarefaRows] = await Promise.all([
    db
      .select({
        id: prazosProcessuais.id,
        processoId: prazosProcessuais.processoId,
        tipo: prazosProcessuais.tipo,
        titulo: prazosProcessuais.titulo,
        dataPrevista: prazosProcessuais.dataPrevista,
        dataRealizada: prazosProcessuais.dataRealizada,
        status: prazosProcessuais.status,
        responsavelId: prazosProcessuais.responsavelId,
        observacao: prazosProcessuais.observacao,
        alertasConfig: prazosProcessuais.alertasConfig,
        criadoPor: prazosProcessuais.criadoPor,
        criadoEm: prazosProcessuais.criadoEm,
        atualizadoEm: prazosProcessuais.atualizadoEm,
        numeroSirel: processos.numeroSirel,
        objeto: processos.objeto,
        secretariaNome: secretarias.nome,
      })
      .from(prazosProcessuais)
      .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId)),
    db
      .select({
        id: tarefasEquipe.id,
        processoId: tarefasEquipe.processoId,
        prazoId: tarefasEquipe.prazoId,
        titulo: tarefasEquipe.titulo,
        descricao: tarefasEquipe.descricao,
        dataEntrega: tarefasEquipe.dataEntrega,
        prioridade: tarefasEquipe.prioridade,
        status: tarefasEquipe.status,
        delegadoPorId: tarefasEquipe.delegadoPorId,
        responsavelId: tarefasEquipe.responsavelId,
        notificarResponsavel: tarefasEquipe.notificarResponsavel,
        concluidaEm: tarefasEquipe.concluidaEm,
        criadoEm: tarefasEquipe.criadoEm,
        atualizadoEm: tarefasEquipe.atualizadoEm,
        numeroSirel: processos.numeroSirel,
        objeto: processos.objeto,
        secretariaNome: secretarias.nome,
      })
      .from(tarefasEquipe)
      .leftJoin(processos, eq(processos.id, tarefasEquipe.processoId))
      .leftJoin(secretarias, eq(secretarias.id, processos.secretariaId)),
  ]);

  const userNames = await loadUserNames(db, [
    ...prazoRows.map((row: any) => row.responsavelId ?? row.criadoPor ?? null),
    ...tarefaRows.map((row: any) => row.responsavelId),
    ...tarefaRows.map((row: any) => row.delegadoPorId),
  ]);

  const mappedPrazos = prazoRows.map((row: any) => {
    const base = buildPrazoView(row);
    const responsavelId = row.responsavelId ?? row.criadoPor ?? null;
    return {
      ...base,
      itemTipo: "PRAZO_PROCESSUAL" as const,
      prazoId: row.id,
      tarefaId: null,
      prioridade: null,
      dataLimite: row.dataPrevista,
      responsavelId,
      responsavelNome: responsavelId ? userNames.get(responsavelId) ?? null : null,
      delegadoPorId: null,
      delegadoPorNome: null,
    };
  });

  const sanitizedPrazos = mappedPrazos.map(sanitizeAgendaItem);

  const mappedTarefas = tarefaRows.map((row: any) => buildTaskView(row, userNames));
  const sanitizedTarefas = mappedTarefas.map(sanitizeAgendaItem);

  return {
    prazos: sanitizedPrazos,
    tarefas: sanitizedTarefas,
    all: [...sanitizedPrazos, ...sanitizedTarefas],
  };
}

function normalizeShareFilters(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, any>;
}

function resolveShareContextUserId(share: any) {
  return share.compartilhadoComId ?? share.compartilhadoPorId ?? null;
}

async function loadAgendaShare(db: any, token: string) {
  const [share] = await db
    .select()
    .from(prazosAgendaCompartilhamentos)
    .where(eq(prazosAgendaCompartilhamentos.token, token))
    .limit(1);

  if (!share || !share.ativo) {
    throw new Error("Compartilhamento inválido ou expirado.");
  }

  if (share.expiraEm && share.expiraEm < new Date()) {
    throw new Error("Compartilhamento expirado.");
  }

  return share;
}

export const prazosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const rows = await db
      .select({
        id: prazosProcessuais.id,
        titulo: prazosProcessuais.titulo,
        tipo: prazosProcessuais.tipo,
        dataPrevista: prazosProcessuais.dataPrevista,
        dataRealizada: prazosProcessuais.dataRealizada,
        status: prazosProcessuais.status,
        processoId: prazosProcessuais.processoId,
        numeroSirel: processos.numeroSirel,
      })
      .from(prazosProcessuais)
      .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
      .orderBy(asc(prazosProcessuais.dataPrevista));

    const parsed = rows.map(buildPrazoView);
    const today = parsed.filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining === 0);
    const next48h = parsed.filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 2);
    const overdue = parsed.filter((item) => item.status === "EM_ATRASO");
    const thisWeek = parsed.filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 7);
    const completedWeek = parsed.filter((item) => item.status === "CONCLUIDO" && item.dataRealizada && new Date(item.dataRealizada) >= startOfDay(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

    const alerts = parsed
      .filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining <= 7)
      .sort((left, right) => {
        const leftWeight = left.status === "EM_ATRASO" ? -100 : left.daysRemaining ?? 999;
        const rightWeight = right.status === "EM_ATRASO" ? -100 : right.daysRemaining ?? 999;
        return leftWeight - rightWeight;
      })
      .slice(0, 8);

    return {
      total: parsed.length,
      hoje: today.length,
      proximas48h: next48h.length,
      atrasados: overdue.length,
      semana: thisWeek.length,
      concluidosSemana: completedWeek.length,
      alerts,
    };
  }),

  agendaSummary: publicProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const currentUserId = ctx.user?.id ?? null;
    const { all, tarefas } = await loadAgendaItems(db);

    const openItems = all.filter((item: any) => item.status !== "CONCLUIDO");
    const atrasados = openItems.filter((item: any) => isItemOverdue(item));
    const em48h = openItems.filter((item: any) => item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 2);
    const semana = openItems.filter((item: any) => item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 7);
    const concluidosSemana = all.filter((item: any) => {
      if (item.status !== "CONCLUIDO") return false;
      const baseDate = parseDateValue(item.dataRealizada ?? item.atualizadoEm);
      if (!baseDate) return false;
      return baseDate >= startOfDay(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    });

    const delegados = currentUserId
      ? tarefas.filter((item: any) => item.delegadoPorId === currentUserId && item.status !== "CONCLUIDO")
      : [];
    const meusItens = currentUserId
      ? all.filter(
          (item: any) =>
            item.responsavelId === currentUserId ||
            item.delegadoPorId === currentUserId ||
            (item.itemTipo === "PRAZO_PROCESSUAL" && item.criadoPor === currentUserId),
        )
      : [];
    const meusAtrasados = meusItens.filter((item: any) => isItemOverdue(item));
    const meus48h = meusItens.filter((item: any) => item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 2);

    const alerts = openItems
      .filter((item: any) => item.daysRemaining !== null && item.daysRemaining <= 2)
      .sort(compareAgendaItems)
      .slice(0, 10);

    return {
      totalItens: all.length,
      atrasados: atrasados.length,
      em48h: em48h.length,
      estaSemana: semana.length,
      delegados: delegados.length,
      concluidosSemana: concluidosSemana.length,
      tarefasPendentes: tarefas.filter((item: any) => item.status !== "CONCLUIDO").length,
      meusAtrasados: meusAtrasados.length,
      meus48h: meus48h.length,
      alerts,
    };
  }),

  teamWorkload: publicProcedure.query(async () => {
    const db = requireDb();
    const { tarefas } = await loadAgendaItems(db);
    const weekStart = startOfWeek();
    const weekEnd = endOfWeek();

    const weeklyTasks = tarefas.filter((item: any) => {
      const baseDate = parseDateValue(item.dataLimite ?? item.dataPrevista);
      if (!baseDate) return false;
      return baseDate >= weekStart && baseDate <= weekEnd;
    });

    const byResponsible = new Map<
      number,
      {
        responsavelId: number;
        responsavelNome: string;
        pendente: number;
        emAndamento: number;
        aguardando: number;
        bloqueado: number;
        concluido: number;
      }
    >();

    for (const item of weeklyTasks) {
      const responsavelId = Number(item.responsavelId ?? 0);
      if (!responsavelId) continue;
      const bucket = byResponsible.get(responsavelId) ?? {
        responsavelId,
        responsavelNome: item.responsavelNome ?? "Sem responsável",
        pendente: 0,
        emAndamento: 0,
        aguardando: 0,
        bloqueado: 0,
        concluido: 0,
      };

      if (item.status === "CONCLUIDO") bucket.concluido += 1;
      else if (item.status === "EM_ANDAMENTO") bucket.emAndamento += 1;
      else if (item.status === "AGUARDANDO") bucket.aguardando += 1;
      else if (item.status === "BLOQUEADO") bucket.bloqueado += 1;
      else bucket.pendente += 1;

      byResponsible.set(responsavelId, bucket);
    }

    const items = Array.from(byResponsible.values())
      .map((item) => ({
        ...item,
        abertos: item.pendente + item.emAndamento + item.aguardando + item.bloqueado,
      }))
      .sort((left, right) => right.abertos - left.abertos || left.responsavelNome.localeCompare(right.responsavelNome));

    const mediaAbertos = items.length ? items.reduce((acc, item) => acc + item.abertos, 0) / items.length : 0;

    return {
      periodo: {
        inicio: weekStart.toISOString(),
        fim: weekEnd.toISOString(),
      },
      mediaAbertos,
      items: items.map((item) => ({
        ...item,
        acimaDaMedia: item.abertos > mediaAbertos,
      })),
    };
  }),

  agendaList: publicProcedure.input(prazoAgendaListInputSchema).query(async ({ ctx, input }) => {
    const db = requireDb();
    const currentUserId = ctx.user?.id ?? null;
    const { all } = await loadAgendaItems(db);
    const items = filterAgendaItems(all, input, currentUserId);
    const total = items.length;
    const offset = (input.pagina - 1) * input.limite;
    const paged = items.slice(offset, offset + input.limite);

    return {
      pagina: input.pagina,
      limite: input.limite,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limite)),
      items: paged,
    };
  }),


  agendaShareCreate: operadorProcedure.input(agendaShareCreateInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const now = new Date();
    const token = randomBytes(24).toString("base64url");
    const filtros = normalizeShareFilters(input.filtros);
    const ownerId = ctx.user?.id;
    if (!ownerId) {
      throw new Error("Usuario nao autenticado.");
    }

    const [created] = await db
      .insert(prazosAgendaCompartilhamentos)
      .values({
        token,
        compartilhadoPorId: ownerId,
        compartilhadoComId: input.compartilhadoComId ?? null,
        permissao: input.permissao,
        filtros,
        ativo: true,
        criadoEm: now,
        atualizadoEm: now,
      })
      .returning();

    return {
      token: created.token,
      permissao: created.permissao,
      compartilhadoComId: created.compartilhadoComId ?? null,
      criadoEm: created.criadoEm,
    };
  }),

  agendaShareResolve: publicProcedure.input(agendaShareResolveInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const share = await loadAgendaShare(db, input.token);
    const names = await loadUserNames(db, [share.compartilhadoPorId, share.compartilhadoComId ?? null]);
    const now = new Date();

    await db
      .update(prazosAgendaCompartilhamentos)
      .set({ ultimoAcessoEm: now, atualizadoEm: now })
      .where(eq(prazosAgendaCompartilhamentos.id, share.id));

    return {
      token: share.token,
      permissao: share.permissao,
      filtros: normalizeShareFilters(share.filtros),
      compartilhadoPor: names.get(share.compartilhadoPorId) ?? null,
      compartilhadoCom: share.compartilhadoComId ? names.get(share.compartilhadoComId) ?? null : null,
      compartilhadoComId: share.compartilhadoComId ?? null,
      expiraEm: share.expiraEm ?? null,
    };
  }),

  agendaSharedList: publicProcedure.input(agendaSharedListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const share = await loadAgendaShare(db, input.token);
    const shareFilters = normalizeShareFilters(share.filtros);
    const { all } = await loadAgendaItems(db);
    const contextUserId = resolveShareContextUserId(share);
    const items = filterAgendaItems(
      all,
      {
        ...shareFilters,
        busca: input.busca ?? shareFilters.busca,
      },
      contextUserId,
    );

    const total = items.length;
    const offset = (input.pagina - 1) * input.limite;
    const paged = items.slice(offset, offset + input.limite);

    await db
      .update(prazosAgendaCompartilhamentos)
      .set({ ultimoAcessoEm: new Date(), atualizadoEm: new Date() })
      .where(eq(prazosAgendaCompartilhamentos.id, share.id));

    return {
      pagina: input.pagina,
      limite: input.limite,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limite)),
      items: paged,
      permissao: share.permissao,
    };
  }),

  agendaSharedComment: publicProcedure.input(agendaSharedCommentInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const share = await loadAgendaShare(db, input.token);
    if (share.permissao !== "COMENTARIOS") {
      throw new Error("Compartilhamento apenas para visualizacao.");
    }

    const now = new Date();
    if (input.itemTipo === "TAREFA_EQUIPE") {
      const [previous] = await db
        .select()
        .from(tarefasEquipe)
        .where(eq(tarefasEquipe.id, input.itemId))
        .limit(1);
      if (!previous) {
        throw new Error("Tarefa nao encontrada.");
      }

      const [updated] = await db
        .update(tarefasEquipe)
        .set({
          descricao: appendTextBlock(previous.descricao, input.comentario) as any,
          atualizadoEm: now,
        })
        .where(eq(tarefasEquipe.id, input.itemId))
        .returning();

      await logAuditoria(ctx, {
        tabela: "tarefas_equipe",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: previous,
        dadosNovos: updated,
        descricao: `Comentario adicionado via compartilhamento na tarefa ${updated.titulo}`,
      });

      return updated;
    }

    const [previous] = await db
      .select()
      .from(prazosProcessuais)
      .where(eq(prazosProcessuais.id, input.itemId))
      .limit(1);
    if (!previous) {
      throw new Error("Prazo nao encontrado.");
    }

    const [updated] = await db
      .update(prazosProcessuais)
      .set({
        observacao: appendTextBlock(previous.observacao, input.comentario) as any,
        atualizadoEm: now,
      })
      .where(eq(prazosProcessuais.id, input.itemId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "prazos_processuais",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: previous,
      dadosNovos: updated,
      descricao: `Comentario adicionado via compartilhamento no prazo ${updated.titulo}`,
    });

    return updated;
  }),  list: publicProcedure.input(prazoListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [];

    if (input.processoId) filters.push(eq(prazosProcessuais.processoId, input.processoId));
    if (input.tipo) filters.push(eq(prazosProcessuais.tipo, input.tipo as never));
    if (input.status === "CONCLUIDO") {
      filters.push(eq(prazosProcessuais.status, "CONCLUIDO"));
    }
    if (input.busca) {
      const pattern = `%${input.busca}%`;
      filters.push(
        or(
          ilike(prazosProcessuais.titulo, pattern),
          ilike(processos.numeroSirel, pattern),
          ilike(processos.objeto, pattern),
          ilike(secretarias.nome, pattern),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({
        id: prazosProcessuais.id,
        processoId: prazosProcessuais.processoId,
        tipo: prazosProcessuais.tipo,
        titulo: prazosProcessuais.titulo,
        dataPrevista: prazosProcessuais.dataPrevista,
        dataRealizada: prazosProcessuais.dataRealizada,
        status: prazosProcessuais.status,
        responsavelId: prazosProcessuais.responsavelId,
        observacao: prazosProcessuais.observacao,
        alertasConfig: prazosProcessuais.alertasConfig,
        criadoPor: prazosProcessuais.criadoPor,
        criadoEm: prazosProcessuais.criadoEm,
        atualizadoEm: prazosProcessuais.atualizadoEm,
        numeroSirel: processos.numeroSirel,
        objeto: processos.objeto,
        secretariaNome: secretarias.nome,
      })
      .from(prazosProcessuais)
      .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .where(whereClause)
      .orderBy(asc(prazosProcessuais.dataPrevista), asc(prazosProcessuais.id));

    let items = rows.map(buildPrazoView);
    if (input.status && input.status !== "CONCLUIDO") {
      items = items.filter((item) => item.status === input.status);
    }
    if (input.somenteCriticos) {
      items = items.filter((item) => item.status === "EM_ATRASO" || (item.daysRemaining !== null && item.daysRemaining <= 2));
    }

    const total = items.length;
    const offset = (input.pagina - 1) * input.limite;
    items = items.slice(offset, offset + input.limite);

    return {
      pagina: input.pagina,
      limite: input.limite,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limite)),
      items,
    };
  }),

  processOptions: publicProcedure.query(async () => {
    const db = requireDb();
    return db
      .select({
        id: processos.id,
        numeroSirel: processos.numeroSirel,
        objeto: processos.objeto,
        secretariaNome: secretarias.nome,
      })
      .from(processos)
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .orderBy(desc(processos.criadoEm), desc(processos.id))
      .limit(500);
  }),

  teamMembers: publicProcedure.query(async () => {
    const db = requireDb();
    return db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        role: users.role,
        secretariaId: users.secretariaId,
        secretariaNome: secretarias.nome,
      })
      .from(users)
      .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
      .where(eq(users.ativo, true))
      .orderBy(asc(users.name));
  }),

  save: operadorProcedure.input(prazoSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const dataPrevista = toDateOnly(input.dataPrevista);
    const status: PrazoProcessualInsert["status"] =
      new Date(`${dataPrevista}T00:00:00`) < startOfDay() ? "EM_ATRASO" : "PENDENTE";
    const payload: PrazoProcessualInsert = {
      processoId: input.processoId,
      tipo: input.tipo,
      titulo: input.titulo.trim(),
      dataPrevista,
      status,
      responsavelId: input.responsavelId ?? ctx.user?.id ?? null,
      observacao: input.observacao?.trim() || null,
      alertasConfig: { lembretes: Array.from(new Set(input.lembretes)).sort((a, b) => b - a), canais: ["sistema"] },
      atualizadoEm: new Date(),
    };

    if (input.prazoId) {
      const [updated] = await db
        .update(prazosProcessuais)
        .set(payload)
        .where(eq(prazosProcessuais.id, input.prazoId))
        .returning();

      if (!updated) {
        throw new Error("Prazo não encontrado.");
      }

      await logAuditoria(ctx, {
        tabela: "prazos_processuais",
        registroId: updated.id,
        acao: "UPDATE",
        dadosNovos: updated,
        descricao: `Prazo ${updated.titulo} atualizado`,
      });

      return updated;
    }

    const [created] = await db
      .insert(prazosProcessuais)
      .values({
        ...payload,
        criadoPor: ctx.user?.id ?? null,
        criadoEm: new Date(),
      })
      .returning();

    await logAuditoria(ctx, {
      tabela: "prazos_processuais",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Prazo ${created.titulo} criado`,
    });

    return created;
  }),

  conclude: operadorProcedure.input(prazoConcluirInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const now = new Date();
    const [updated] = await db
      .update(prazosProcessuais)
      .set({
        dataRealizada: input.dataRealizada ? toDateOnly(input.dataRealizada) : now.toISOString().slice(0, 10),
        status: "CONCLUIDO",
        observacao: input.observacaoConclusao?.trim() || null,
        atualizadoEm: now,
      })
      .where(eq(prazosProcessuais.id, input.prazoId))
      .returning();

    if (!updated) {
      throw new Error("Prazo não encontrado.");
    }

    if (input.arquivarTarefasRelacionadas) {
      const tarefasAtualizadas = await db
        .update(tarefasEquipe)
        .set({
          status: "CONCLUIDO",
          concluidaEm: now,
          atualizadoEm: now,
          descricao: `Arquivada automaticamente após conclusão do prazo #${updated.id}.`,
        })
        .where(and(eq(tarefasEquipe.prazoId, updated.id), ne(tarefasEquipe.status, "CONCLUIDO")))
        .returning();

      for (const tarefa of tarefasAtualizadas) {
        await logAuditoria(ctx, {
          tabela: "tarefas_equipe",
          registroId: tarefa.id,
          acao: "UPDATE",
          dadosNovos: tarefa,
          descricao: `Tarefa ${tarefa.titulo} arquivada pela conclusão do prazo ${updated.titulo}`,
        });
      }
    }

    await logAuditoria(ctx, {
      tabela: "prazos_processuais",
      registroId: updated.id,
      acao: "UPDATE",
      dadosNovos: updated,
      descricao: `Prazo ${updated.titulo} concluído`,
    });

    const notificationTargets = Array.from(
      new Set(
        [updated.responsavelId, updated.criadoPor, ctx.user?.id ?? null].filter(
          (id): id is number => typeof id === "number" && id > 0,
        ),
      ),
    );
    if (notificationTargets.length) {
      await upsertSystemNotifications(
        db,
        notificationTargets.map((userId) => ({
          userId,
          processoId: updated.processoId,
          prazoId: updated.id,
          chave: `prazo:${updated.id}:concluido`,
          titulo: "Prazo concluído",
          mensagem: `${updated.titulo} foi concluído.`,
          prioridade: "MEDIA",
          href: "/prazos",
        })),
      );
    }

    return updated;
  }),

  remove: operadorProcedure.input(prazoDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [deleted] = await db.delete(prazosProcessuais).where(eq(prazosProcessuais.id, input.prazoId)).returning();
    if (!deleted) {
      throw new Error("Prazo não encontrado.");
    }

    await logAuditoria(ctx, {
      tabela: "prazos_processuais",
      registroId: deleted.id,
      acao: "DELETE",
      dadosAnteriores: deleted,
      descricao: `Prazo ${deleted.titulo} removido`,
    });

    return { success: true };
  }),

  taskSave: operadorProcedure.input(tarefaEquipeSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const now = new Date();
    const payload: TarefaEquipeInsert = {
      processoId: input.processoId ?? null,
      prazoId: input.prazoId ?? null,
      titulo: input.titulo.trim(),
      descricao: input.descricao?.trim() || null,
      dataEntrega: toDateOnly(input.dataEntrega),
      prioridade: input.prioridade,
      status: input.status,
      delegadoPorId: ctx.user?.id ?? null,
      responsavelId: input.responsavelId,
      notificarResponsavel: input.notificarResponsavel,
      concluidaEm: input.status === "CONCLUIDO" ? now : null,
      atualizadoEm: now,
    };

    if (input.tarefaId) {
      const [previous] = await db.select().from(tarefasEquipe).where(eq(tarefasEquipe.id, input.tarefaId)).limit(1);
      if (!previous) {
        throw new Error("Tarefa não encontrada.");
      }

      const [updated] = await db
        .update(tarefasEquipe)
        .set({
          ...payload,
          atualizadoEm: now,
          delegadoPorId:
            previous.responsavelId !== input.responsavelId
              ? ctx.user?.id ?? previous.delegadoPorId ?? null
              : previous.delegadoPorId ?? ctx.user?.id ?? null,
        })
        .where(eq(tarefasEquipe.id, input.tarefaId))
        .returning();

      await logAuditoria(ctx, {
        tabela: "tarefas_equipe",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: previous,
        dadosNovos: updated,
        descricao: `Tarefa ${updated.titulo} atualizada`,
      });

      if (updated.notificarResponsavel && updated.responsavelId) {
        const houveDelegacao = previous.responsavelId !== updated.responsavelId;
        await upsertSystemNotifications(db, [
          {
            userId: updated.responsavelId,
            processoId: updated.processoId ?? null,
            prazoId: updated.prazoId ?? null,
            chave: `tarefa:${updated.id}:save:${updated.responsavelId}:${updated.status}:${updated.dataEntrega}`,
            titulo: houveDelegacao ? "Nova tarefa delegada" : "Tarefa atualizada",
            mensagem: `${updated.titulo} com entrega em ${updated.dataEntrega}.`,
            prioridade: updated.prioridade === "ALTA" ? "ALTA" : "MEDIA",
            href: "/prazos",
          },
        ]);
      }

      return updated;
    }

    const [created] = await db
      .insert(tarefasEquipe)
      .values({
        ...payload,
        criadoEm: now,
      })
      .returning();

    await logAuditoria(ctx, {
      tabela: "tarefas_equipe",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Tarefa ${created.titulo} criada`,
    });

    if (created.notificarResponsavel && created.responsavelId) {
      await upsertSystemNotifications(db, [
        {
          userId: created.responsavelId,
          processoId: created.processoId ?? null,
          prazoId: created.prazoId ?? null,
          chave: `tarefa:${created.id}:create:${created.responsavelId}:${created.dataEntrega}`,
          titulo: "Nova tarefa delegada",
          mensagem: `${created.titulo} com entrega em ${created.dataEntrega}.`,
          prioridade: created.prioridade === "ALTA" ? "ALTA" : "MEDIA",
          href: "/prazos",
        },
      ]);
    }

    return created;
  }),

  taskSetStatus: operadorProcedure.input(tarefaEquipeStatusInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const now = new Date();
    const [previous] = await db.select().from(tarefasEquipe).where(eq(tarefasEquipe.id, input.tarefaId)).limit(1);
    if (!previous) {
      throw new Error("Tarefa não encontrada.");
    }

    const [updated] = await db
      .update(tarefasEquipe)
      .set({
        status: input.status,
        dataEntrega: input.dataEntrega ? toDateOnly(input.dataEntrega) : undefined,
        descricao: appendTextBlock(previous.descricao, input.comentario) as any,
        concluidaEm: input.status === "CONCLUIDO" ? now : null,
        atualizadoEm: now,
      })
      .where(eq(tarefasEquipe.id, input.tarefaId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "tarefas_equipe",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: previous,
      dadosNovos: updated,
      descricao: `Status da tarefa ${updated.titulo} atualizado para ${updated.status}`,
    });

    const notifications: SystemNotificationPayload[] = [];
    if (updated.responsavelId) {
      notifications.push({
        userId: updated.responsavelId,
        processoId: updated.processoId ?? null,
        prazoId: updated.prazoId ?? null,
        chave: `tarefa:${updated.id}:status:${updated.status}:${updated.atualizadoEm}`,
        titulo: "Status de tarefa atualizado",
        mensagem: `${updated.titulo} está em ${updated.status}.`,
        prioridade: updated.status === "BLOQUEADO" ? "ALTA" : "MEDIA",
        href: "/prazos",
      });
    }

    if (updated.status === "CONCLUIDO" && updated.prazoId) {
      const tarefaAberta = await db
        .select({ id: tarefasEquipe.id })
        .from(tarefasEquipe)
        .where(and(eq(tarefasEquipe.prazoId, updated.prazoId), ne(tarefasEquipe.status, "CONCLUIDO")))
        .limit(1);

      if (!tarefaAberta.length) {
        const [prazoAtualizado] = await db
          .update(prazosProcessuais)
          .set({
            status: "CONCLUIDO",
            dataRealizada: now.toISOString().slice(0, 10),
            atualizadoEm: now,
          })
          .where(and(eq(prazosProcessuais.id, updated.prazoId), ne(prazosProcessuais.status, "CONCLUIDO")))
          .returning();

        if (prazoAtualizado) {
          await logAuditoria(ctx, {
            tabela: "prazos_processuais",
            registroId: prazoAtualizado.id,
            acao: "UPDATE",
            dadosNovos: prazoAtualizado,
            descricao: `Prazo ${prazoAtualizado.titulo} concluído automaticamente por tarefas finalizadas`,
          });

          const targets = Array.from(
            new Set(
              [prazoAtualizado.responsavelId, prazoAtualizado.criadoPor].filter(
                (id): id is number => typeof id === "number" && id > 0,
              ),
            ),
          );

          notifications.push(
            ...targets.map((userId) => ({
              userId,
              processoId: prazoAtualizado.processoId,
              prazoId: prazoAtualizado.id,
              chave: `prazo:${prazoAtualizado.id}:auto-concluido`,
              titulo: "Prazo concluído automaticamente",
              mensagem: `${prazoAtualizado.titulo} foi concluído após finalização das tarefas relacionadas.`,
              prioridade: "MEDIA" as const,
              href: "/prazos",
            })),
          );
        }
      }
    }

    if (notifications.length) {
      await upsertSystemNotifications(db, notifications);
    }

    return updated;
  }),

  taskBulkAction: operadorProcedure.input(tarefaEquipeBulkInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const now = new Date();
    const patch: Partial<TarefaEquipeInsert> = { atualizadoEm: now };

    if (input.acao === "CONCLUIR") {
      patch.status = "CONCLUIDO";
      patch.concluidaEm = now;
    } else if (input.acao === "DELEGAR") {
      if (!input.responsavelId) {
        throw new Error("Informe o responsável para delegar.");
      }
      patch.responsavelId = input.responsavelId;
      patch.delegadoPorId = ctx.user?.id ?? null;
      patch.concluidaEm = null;
      if (input.comentario) patch.descricao = input.comentario.trim();
    } else if (input.acao === "REAGENDAR") {
      if (!input.dataEntrega) {
        throw new Error("Informe uma data para reagendar.");
      }
      patch.dataEntrega = toDateOnly(input.dataEntrega);
      patch.concluidaEm = null;
      if (input.comentario) patch.descricao = input.comentario.trim();
    }

    const updated = await db
      .update(tarefasEquipe)
      .set(patch)
      .where(inArray(tarefasEquipe.id, input.tarefaIds))
      .returning();

    const notifications: SystemNotificationPayload[] = [];
    const prazoIdsConcluidos = new Set<number>();

    for (const item of updated) {
      await logAuditoria(ctx, {
        tabela: "tarefas_equipe",
        registroId: item.id,
        acao: "UPDATE",
        dadosNovos: item,
        descricao: `Ação em lote (${input.acao}) na tarefa ${item.titulo}`,
      });

      if (input.acao === "DELEGAR" && item.responsavelId) {
        notifications.push({
          userId: item.responsavelId,
          processoId: item.processoId ?? null,
          prazoId: item.prazoId ?? null,
          chave: `tarefa:${item.id}:delegada-lote:${item.responsavelId}:${item.atualizadoEm}`,
          titulo: "Nova tarefa delegada",
          mensagem: `${item.titulo} foi delegada para você.`,
          prioridade: item.prioridade === "ALTA" ? "ALTA" : "MEDIA",
          href: "/prazos",
        });
      }

      if (input.acao === "CONCLUIR" && item.prazoId) {
        prazoIdsConcluidos.add(item.prazoId);
      }
    }

    if (input.acao === "CONCLUIR" && prazoIdsConcluidos.size) {
      for (const prazoId of prazoIdsConcluidos) {
        const tarefaAberta = await db
          .select({ id: tarefasEquipe.id })
          .from(tarefasEquipe)
          .where(and(eq(tarefasEquipe.prazoId, prazoId), ne(tarefasEquipe.status, "CONCLUIDO")))
          .limit(1);
        if (tarefaAberta.length) continue;

        const [prazoAtualizado] = await db
          .update(prazosProcessuais)
          .set({
            status: "CONCLUIDO",
            dataRealizada: now.toISOString().slice(0, 10),
            atualizadoEm: now,
          })
          .where(and(eq(prazosProcessuais.id, prazoId), ne(prazosProcessuais.status, "CONCLUIDO")))
          .returning();
        if (!prazoAtualizado) continue;

        await logAuditoria(ctx, {
          tabela: "prazos_processuais",
          registroId: prazoAtualizado.id,
          acao: "UPDATE",
          dadosNovos: prazoAtualizado,
          descricao: `Prazo ${prazoAtualizado.titulo} concluído automaticamente por ação em lote`,
        });

        const prazoTargets = Array.from(
          new Set(
            [prazoAtualizado.responsavelId, prazoAtualizado.criadoPor].filter(
              (id): id is number => typeof id === "number" && id > 0,
            ),
          ),
        );
        notifications.push(
          ...prazoTargets.map((userId) => ({
            userId,
            processoId: prazoAtualizado.processoId,
            prazoId: prazoAtualizado.id,
            chave: `prazo:${prazoAtualizado.id}:auto-concluido-lote`,
            titulo: "Prazo concluído automaticamente",
            mensagem: `${prazoAtualizado.titulo} foi concluído após finalização das tarefas relacionadas.`,
            prioridade: "MEDIA" as const,
            href: "/prazos",
          })),
        );
      }
    }

    if (notifications.length) {
      await upsertSystemNotifications(db, notifications);
    }

    return { updated: updated.length };
  }),

  taskRemove: operadorProcedure.input(tarefaEquipeDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [deleted] = await db.delete(tarefasEquipe).where(eq(tarefasEquipe.id, input.tarefaId)).returning();
    if (!deleted) {
      throw new Error("Tarefa não encontrada.");
    }

    await logAuditoria(ctx, {
      tabela: "tarefas_equipe",
      registroId: deleted.id,
      acao: "DELETE",
      dadosAnteriores: deleted,
      descricao: `Tarefa ${deleted.titulo} removida`,
    });

    return { success: true };
  }),
});

