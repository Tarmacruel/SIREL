import { and, eq, inArray } from "drizzle-orm";

import type { NotificationPreferences } from "@sirel/shared/schemas/notificacoes";

import {
  notificacoesEnvios,
  notificacoesPushSubscriptions,
  notificacoesUsuario,
  users,
} from "../db/schema.js";
import {
  defaultNotificationPreferences,
  loadNotificationPreferencesMap,
} from "./notificacoes-preferencias.js";
import { sendEmailNotification } from "./notificacoes-email.js";
import { sendPushNotification } from "./notificacoes-push.js";

export type NotificationScope = "MEUS_ITENS" | "EQUIPE" | "CRITICOS";

export type DispatchNotificationPayload = {
  userId: number;
  chave: string;
  titulo: string;
  mensagem: string;
  prioridade?: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  tipo?: "PRAZO" | "MOVIMENTACAO" | "DOCUMENTO" | "SISTEMA";
  processoId?: number | null;
  documentoId?: number | null;
  prazoId?: number | null;
  href?: string | null;
  dataExpiracao?: Date | null;
  origemAutomatica?: boolean;
  scope?: NotificationScope;
};

type DeliveryStatus = "ENVIADO" | "FALHA" | "IGNORADO";

function buildActionData(payload: DispatchNotificationPayload) {
  return payload.processoId || payload.documentoId || payload.prazoId
    ? {
        processoId: payload.processoId ?? null,
        documentoId: payload.documentoId ?? null,
        prazoId: payload.prazoId ?? null,
        href: payload.href ?? null,
      }
    : null;
}

function isCriticalPriority(priority: string) {
  return priority === "ALTA" || priority === "URGENTE";
}

function shouldSendByScope(
  preferences: NotificationPreferences,
  scope: NotificationScope,
  priority: DispatchNotificationPayload["prioridade"] = "MEDIA",
) {
  if (preferences.escopo === "CRITICOS") {
    return isCriticalPriority(priority);
  }
  if (preferences.escopo === "MEUS_ITENS") {
    return scope === "MEUS_ITENS";
  }
  return true;
}

async function recordDelivery(
  db: any,
  payload: DispatchNotificationPayload,
  canal: "EMAIL" | "PUSH",
  status: DeliveryStatus,
  destino: string | null,
  erro: string | null,
  now: Date,
) {
  await db
    .insert(notificacoesEnvios)
    .values({
      userId: payload.userId,
      chave: payload.chave,
      canal,
      status,
      destino: destino ?? null,
      erro: erro ?? null,
      tentativas: 1,
      ultimoEnvioEm: now,
      criadoEm: now,
      atualizadoEm: now,
    })
    .onConflictDoNothing();
}

async function upsertInAppNotification(
  db: any,
  payload: DispatchNotificationPayload,
  now: Date,
) {
  const prioridade = payload.prioridade ?? "MEDIA";
  const tipo = payload.tipo ?? "SISTEMA";
  const origemAutomatica = payload.origemAutomatica ?? true;

  await db
    .insert(notificacoesUsuario)
    .values({
      userId: payload.userId,
      processoId: payload.processoId ?? null,
      documentoId: payload.documentoId ?? null,
      prazoId: payload.prazoId ?? null,
      tipo,
      prioridade,
      chave: payload.chave,
      titulo: payload.titulo,
      mensagem: payload.mensagem,
      href: payload.href ?? null,
      acaoRelacionada: buildActionData(payload),
      origemAutomatica,
      atualizadoEm: now,
      dataExpiracao: payload.dataExpiracao ?? null,
    })
    .onConflictDoUpdate({
      target: [notificacoesUsuario.userId, notificacoesUsuario.chave],
      set: {
        processoId: payload.processoId ?? null,
        documentoId: payload.documentoId ?? null,
        prazoId: payload.prazoId ?? null,
        tipo,
        prioridade,
        titulo: payload.titulo,
        mensagem: payload.mensagem,
        href: payload.href ?? null,
        acaoRelacionada: buildActionData(payload),
        origemAutomatica,
        atualizadoEm: now,
        dataExpiracao: payload.dataExpiracao ?? null,
      },
    });
}

export async function dispatchNotifications(
  db: any,
  payloads: DispatchNotificationPayload[],
  options?: {
    scope?: NotificationScope;
    preferencesMap?: Map<number, NotificationPreferences>;
  },
) {
  if (!payloads.length) return;

  const now = new Date();
  const deduped = new Map<string, DispatchNotificationPayload>();
  for (const payload of payloads) {
    if (!payload.userId || !payload.chave) continue;
    const key = `${payload.userId}:${payload.chave}`;
    if (deduped.has(key)) continue;
    deduped.set(key, payload);
  }

  const entries = Array.from(deduped.values());
  if (!entries.length) return;

  const userIds = Array.from(new Set(entries.map((payload) => payload.userId)));
  const preferencesMap =
    options?.preferencesMap ?? (await loadNotificationPreferencesMap(db, userIds));

  const userRows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds));
  const emailMap = new Map<number, string | null>();
  for (const row of userRows) {
    emailMap.set(row.id, row.email ?? null);
  }

  const pushRows = await db
    .select({
      userId: notificacoesPushSubscriptions.userId,
      id: notificacoesPushSubscriptions.id,
      endpoint: notificacoesPushSubscriptions.endpoint,
      p256dh: notificacoesPushSubscriptions.p256dh,
      auth: notificacoesPushSubscriptions.auth,
    })
    .from(notificacoesPushSubscriptions)
    .where(inArray(notificacoesPushSubscriptions.userId, userIds));
  const pushMap = new Map<number, typeof pushRows>();
  for (const row of pushRows) {
    const bucket = pushMap.get(row.userId) ?? [];
    bucket.push(row);
    pushMap.set(row.userId, bucket);
  }

  const keys = Array.from(new Set(entries.map((payload) => payload.chave)));
  const deliveredRows = await db
    .select({
      userId: notificacoesEnvios.userId,
      chave: notificacoesEnvios.chave,
      canal: notificacoesEnvios.canal,
    })
    .from(notificacoesEnvios)
    .where(and(inArray(notificacoesEnvios.userId, userIds), inArray(notificacoesEnvios.chave, keys)));
  const deliveredSet = new Set(
    deliveredRows.map((row: any) => `${row.userId}:${row.chave}:${row.canal}`),
  );

  for (const payload of entries) {
    const preferences =
      preferencesMap.get(payload.userId) ?? defaultNotificationPreferences;
    const scope = payload.scope ?? options?.scope ?? "MEUS_ITENS";
    const prioridade = payload.prioridade ?? "MEDIA";

    if (!shouldSendByScope(preferences, scope, prioridade)) continue;

    if (preferences.canais.inApp) {
      await upsertInAppNotification(db, payload, now);
    }

    if (preferences.canais.email) {
      const deliveryKey = `${payload.userId}:${payload.chave}:EMAIL`;
      if (!deliveredSet.has(deliveryKey)) {
        const email = emailMap.get(payload.userId) ?? null;
        if (email) {
          const result = await sendEmailNotification({
            to: email,
            title: payload.titulo,
            message: payload.mensagem,
            href: payload.href ?? undefined,
            priority: prioridade,
          });
          await recordDelivery(
            db,
            payload,
            "EMAIL",
            result.status,
            email,
            result.error,
            now,
          );
        } else {
          await recordDelivery(
            db,
            payload,
            "EMAIL",
            "IGNORADO",
            null,
            "Usuario sem e-mail cadastrado.",
            now,
          );
        }
        deliveredSet.add(deliveryKey);
      }
    }

    if (preferences.canais.push) {
      const deliveryKey = `${payload.userId}:${payload.chave}:PUSH`;
      if (!deliveredSet.has(deliveryKey)) {
        const subscriptions = pushMap.get(payload.userId) ?? [];
        if (!subscriptions.length) {
          await recordDelivery(
            db,
            payload,
            "PUSH",
            "IGNORADO",
            null,
            "Usuario sem assinatura push.",
            now,
          );
          deliveredSet.add(deliveryKey);
          continue;
        }

        let hadSuccess = false;
        let lastError: string | null = null;

        for (const subscription of subscriptions) {
          const result = await sendPushNotification({
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            title: payload.titulo,
            message: payload.mensagem,
            href: payload.href ?? undefined,
          });

          if (result.status === "ENVIADO") {
            hadSuccess = true;
          } else if (result.status === "REMOVER_ASSINATURA") {
            await db
              .delete(notificacoesPushSubscriptions)
              .where(eq(notificacoesPushSubscriptions.id, subscription.id));
          } else if (result.error) {
            lastError = result.error;
          }
        }

        const status: DeliveryStatus = hadSuccess ? "ENVIADO" : "FALHA";
        await recordDelivery(
          db,
          payload,
          "PUSH",
          status,
          subscriptions[0]?.endpoint ?? null,
          hadSuccess ? null : lastError ?? "Falha ao enviar push.",
          now,
        );
        deliveredSet.add(deliveryKey);
      }
    }
  }
}
