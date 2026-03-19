import { z } from "zod";

export const auditoriaListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  tabela: z.string().trim().optional(),
  acao: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),
  processoId: z.number().int().positive().optional(),
  documentoId: z.number().int().positive().optional(),
  usuarioId: z.number().int().positive().optional(),
});

export type AuditoriaListInput = z.infer<typeof auditoriaListInputSchema>;
