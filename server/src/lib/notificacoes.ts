import { and, desc, eq, gte, inArray, isNull, lte, notInArray, or } from "drizzle-orm";

import { requireDb } from "../db/client.js";
import {
  documentos,
  movimentacoesWorkflow,
  notificacoesUsuario,
  prazosProcessuais,
  processos,
} from "../db/schema.js";
import { dispatchNotifications } from "./notificacoes-dispatch.js";
import { loadNotificationPreferences } from "./notificacoes-preferencias.js";

function formatDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

type NotificationPayload = {
  userId: number;
  processoId?: number | null;
  documentoId?: number | null;
  prazoId?: number | null;
  tipo: "PRAZO" | "MOVIMENTACAO" | "DOCUMENTO" | "SISTEMA";
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  chave: string;
  titulo: string;
  mensagem: string;
  href?: string | null;
  dataExpiracao?: Date | null;
};

function getPrazoPriority(status: string, dataPrevista: string, today: string): NotificationPayload["prioridade"] {
  if (status === "EM_ATRASO" || dataPrevista < today) return "URGENTE";
  if (dataPrevista === today) return "ALTA";
  return "MEDIA";
}

export async function syncOperationalNotifications(userId: number) {
  const db = requireDb();
  const now = new Date();
  const today = formatDateString(now);
  const weekLimit = formatDateString(addDays(now, 7));
  const recentLimit = addDays(now, -2);

  const [criticalDeadlines, recentMovements, recentDocuments] = await Promise.all([
    db
      .select({
        id: prazosProcessuais.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        titulo: prazosProcessuais.titulo,
        dataPrevista: prazosProcessuais.dataPrevista,
        status: prazosProcessuais.status,
      })
      .from(prazosProcessuais)
      .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
      .where(
        and(
          inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
          lte(prazosProcessuais.dataPrevista, weekLimit),
        ),
      )
      .orderBy(prazosProcessuais.dataPrevista, processos.numeroSirel)
      .limit(20),
    db
      .select({
        id: movimentacoesWorkflow.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        descricao: movimentacoesWorkflow.descricao,
        criadoEm: movimentacoesWorkflow.criadoEm,
      })
      .from(movimentacoesWorkflow)
      .innerJoin(processos, eq(processos.id, movimentacoesWorkflow.processoId))
      .where(gte(movimentacoesWorkflow.criadoEm, recentLimit))
      .orderBy(desc(movimentacoesWorkflow.criadoEm), desc(movimentacoesWorkflow.id))
      .limit(12),
    db
      .select({
        id: documentos.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        titulo: documentos.titulo,
        criadoEm: documentos.criadoEm,
      })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(gte(documentos.criadoEm, recentLimit))
      .orderBy(desc(documentos.criadoEm), desc(documentos.id))
      .limit(12),
  ]);

  const payloads: NotificationPayload[] = [
    ...criticalDeadlines.map((item) => ({
      userId,
      processoId: item.processoId,
      prazoId: item.id,
      tipo: "PRAZO" as const,
      prioridade: getPrazoPriority(item.status, item.dataPrevista, today),
      chave: `prazo:${item.id}:${item.status}:${item.dataPrevista}`,
      titulo: `${item.numeroSirel} - ${item.titulo}`,
      mensagem: `Prazo previsto para ${item.dataPrevista}.`,
      href: "/prazos",
      dataExpiracao: addDays(new Date(`${item.dataPrevista}T12:00:00`), 30),
    })),
    ...recentMovements.map((item) => ({
      userId,
      processoId: item.processoId,
      tipo: "MOVIMENTACAO" as const,
      prioridade: "BAIXA" as const,
      chave: `mov:${item.id}`,
      titulo: `${item.numeroSirel} - Workflow atualizado`,
      mensagem: item.descricao,
      href: "/workflow",
      dataExpiracao: addDays(new Date(item.criadoEm), 7),
    })),
    ...recentDocuments.map((item) => ({
      userId,
      processoId: item.processoId,
      documentoId: item.id,
      tipo: "DOCUMENTO" as const,
      prioridade: "BAIXA" as const,
      chave: `doc:${item.id}`,
      titulo: `${item.numeroSirel} - Documento anexado`,
      mensagem: item.titulo,
      href: "/documentos",
      dataExpiracao: addDays(new Date(item.criadoEm), 7),
    })),
  ];

  const preferences = await loadNotificationPreferences(db, userId);
  await dispatchNotifications(db, payloads, {
    scope: "EQUIPE",
    preferencesMap: new Map([[userId, preferences]]),
  });

  const activeKeys = preferences.canais.inApp ? payloads.map((item) => item.chave) : [];
  const expireBaseFilters = [
    eq(notificacoesUsuario.userId, userId),
    eq(notificacoesUsuario.origemAutomatica, true),
    or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
  ] as const;

  if (activeKeys.length) {
    await db
      .update(notificacoesUsuario)
      .set({
        lida: true,
        atualizadoEm: now,
        dataExpiracao: now,
      })
      .where(and(...expireBaseFilters, notInArray(notificacoesUsuario.chave, activeKeys)));
  } else {
    await db
      .update(notificacoesUsuario)
      .set({
        lida: true,
        atualizadoEm: now,
        dataExpiracao: now,
      })
      .where(and(...expireBaseFilters));
  }
}

