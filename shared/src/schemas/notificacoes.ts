import { z } from "zod";

export const notificationFrequencyOptions = [
  "IMEDIATA",
  "RESUMO_DIARIO",
  "RESUMO_SEMANAL",
] as const;

export const notificationScopeOptions = [
  "MEUS_ITENS",
  "EQUIPE",
  "CRITICOS",
] as const;

export const notificationPreferencesSchema = z.object({
  frequencia: z.enum(notificationFrequencyOptions),
  escopo: z.enum(notificationScopeOptions),
  canais: z.object({
    inApp: z.boolean(),
    email: z.boolean(),
    push: z.boolean(),
  }),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().min(1),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type PushSubscriptionPayload = z.infer<typeof pushSubscriptionSchema>;
