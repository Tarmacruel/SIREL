import { z } from "zod";

import { workflowModuleOptions, workflowSituacaoOptions } from "../const.js";

export const workflowListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(12),
  search: z.string().trim().optional(),
  moduloAtual: z.string().trim().optional(),
  situacao: z.string().trim().optional(),
});

export const workflowMoveInputSchema = z.object({
  processoId: z.number().int().positive(),
  moduloDestino: z.enum(workflowModuleOptions),
  situacao: z.enum(workflowSituacaoOptions),
  etapaAtual: z.string().trim().min(3).max(255),
  statusId: z.number().int().positive().optional(),
  condutorProcessoId: z.number().int().positive().optional(),
  descricao: z.string().trim().min(3).max(255).optional(),
  observacao: z.string().trim().max(2000).optional(),
});

export const workflowPublishInputSchema = z.object({
  processoId: z.number().int().positive(),
  condutorProcessoId: z.number().int().positive(),
  statusId: z.number().int().positive().optional(),
  descricao: z.string().trim().min(3).max(255).optional(),
  observacao: z.string().trim().max(2000).optional(),
});

export type WorkflowListInput = z.infer<typeof workflowListInputSchema>;
export type WorkflowMoveInput = z.infer<typeof workflowMoveInputSchema>;
export type WorkflowPublishInput = z.infer<typeof workflowPublishInputSchema>;
