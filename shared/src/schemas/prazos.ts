import { z } from "zod";

import { prazoProcessualStatusOptions, prazoProcessualTipoOptions } from "../const.js";

export const prazoListInputSchema = z.object({
  pagina: z.number().int().positive().default(1),
  limite: z.number().int().positive().max(100).default(10),
  processoId: z.number().int().positive().optional(),
  tipo: z.enum(prazoProcessualTipoOptions).optional(),
  status: z.enum(prazoProcessualStatusOptions).optional(),
  busca: z.string().trim().optional(),
  somenteCriticos: z.boolean().optional(),
});

export const prazoSaveInputSchema = z.object({
  prazoId: z.number().int().positive().optional(),
  processoId: z.number().int().positive(),
  tipo: z.enum(prazoProcessualTipoOptions),
  titulo: z.string().trim().min(3).max(200),
  dataPrevista: z.string().min(8),
  observacao: z.string().trim().max(1000).optional(),
  lembretes: z.array(z.number().int().nonnegative()).default([7, 3, 1]),
});

export const prazoConcluirInputSchema = z.object({
  prazoId: z.number().int().positive(),
  dataRealizada: z.string().min(8).optional(),
  observacaoConclusao: z.string().trim().max(1000).optional(),
});

export const prazoDeleteInputSchema = z.object({
  prazoId: z.number().int().positive(),
});

export type PrazoListInput = z.infer<typeof prazoListInputSchema>;
export type PrazoSaveInput = z.infer<typeof prazoSaveInputSchema>;
