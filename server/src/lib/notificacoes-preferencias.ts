import { eq, inArray } from "drizzle-orm";

import type { NotificationPreferences } from "@sirel/shared/schemas/notificacoes";

import { notificacoesPreferencias } from "../db/schema.js";

export const defaultNotificationPreferences: NotificationPreferences = {
  frequencia: "IMEDIATA",
  escopo: "MEUS_ITENS",
  canais: {
    inApp: true,
    email: false,
    push: false,
  },
};

function mapPreferencesRow(row: typeof notificacoesPreferencias.$inferSelect | null | undefined): NotificationPreferences {
  if (!row) {
    return {
      frequencia: defaultNotificationPreferences.frequencia,
      escopo: defaultNotificationPreferences.escopo,
      canais: { ...defaultNotificationPreferences.canais },
    };
  }
  return {
    frequencia: row.frequencia ?? defaultNotificationPreferences.frequencia,
    escopo: row.escopo ?? defaultNotificationPreferences.escopo,
    canais: {
      inApp: Boolean(row.canalInApp),
      email: Boolean(row.canalEmail),
      push: Boolean(row.canalPush),
    },
  };
}

export async function loadNotificationPreferences(
  db: any,
  userId: number,
): Promise<NotificationPreferences> {
  const [row] = await db
    .select()
    .from(notificacoesPreferencias)
    .where(eq(notificacoesPreferencias.userId, userId))
    .limit(1);
  return mapPreferencesRow(row);
}

export async function loadNotificationPreferencesMap(
  db: any,
  userIds: number[],
): Promise<Map<number, NotificationPreferences>> {
  const ids = Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (!ids.length) return new Map();

  const rows = await db
    .select()
    .from(notificacoesPreferencias)
    .where(inArray(notificacoesPreferencias.userId, ids));

  const map = new Map<number, NotificationPreferences>();
  for (const row of rows) {
    map.set(row.userId, mapPreferencesRow(row));
  }

  for (const id of ids) {
    if (!map.has(id)) {
      map.set(id, {
        frequencia: defaultNotificationPreferences.frequencia,
        escopo: defaultNotificationPreferences.escopo,
        canais: { ...defaultNotificationPreferences.canais },
      });
    }
  }

  return map;
}
