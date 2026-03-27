import { z } from "zod";

import {
  prazoProcessualStatusOptions,
  prazoProcessualTipoOptions,
  agendaCompartilhamentoPermissaoOptions,
  tarefaEquipePrioridadeOptions,
  tarefaEquipeStatusOptions,
} from "../const.js";

const agendaEscopoOptions = [
  "DASHBOARD",
  "MEUS_PRAZOS",
  "TAREFAS_EQUIPE",
  "ALERTAS",
  "HISTORICO",
] as const;

const agendaItemTipoOptions = [
  "PRAZO_PROCESSUAL",
  "TAREFA_EQUIPE",
] as const;

export const prazoListInputSchema = z.object({
  pagina: z.number().int().positive().default(1),
  limite: z.number().int().positive().max(100).default(10),
  processoId: z.number().int().positive().optional(),
  tipo: z.enum(prazoProcessualTipoOptions).optional(),
  status: z.enum(prazoProcessualStatusOptions).optional(),
  busca: z.string().trim().optional(),
  somenteCriticos: z.boolean().optional(),
});

export const prazoAgendaListInputSchema = z.object({
  pagina: z.number().int().positive().default(1),
  limite: z.number().int().positive().max(100).default(10),
  busca: z.string().trim().optional(),
  escopo: z.enum(agendaEscopoOptions).optional(),
  itemTipo: z.enum(agendaItemTipoOptions).optional(),
  processoId: z.number().int().positive().optional(),
  prazoTipo: z.enum(prazoProcessualTipoOptions).optional(),
  statusPrazo: z.enum(prazoProcessualStatusOptions).optional(),
  statusTarefa: z.enum(tarefaEquipeStatusOptions).optional(),
  prioridadeTarefa: z.enum(tarefaEquipePrioridadeOptions).optional(),
  responsavelId: z.number().int().positive().optional(),
  somenteCriticos: z.boolean().optional(),
  somenteDelegadosPorMim: z.boolean().optional(),
  ocultarConcluidos: z.boolean().optional(),
  somenteMeusItens: z.boolean().optional(),
});

export const agendaShareFiltersSchema = prazoAgendaListInputSchema.omit({
  pagina: true,
  limite: true,
});

export const agendaShareCreateInputSchema = z.object({
  compartilhadoComId: z.number().int().positive().optional(),
  permissao: z.enum(agendaCompartilhamentoPermissaoOptions),
  filtros: agendaShareFiltersSchema.optional(),
});

export const agendaShareResolveInputSchema = z.object({
  token: z.string().min(16),
});

export const agendaSharedListInputSchema = z.object({
  token: z.string().min(16),
  pagina: z.number().int().positive().default(1),
  limite: z.number().int().positive().max(100).default(10),
  busca: z.string().trim().optional(),
});

export const agendaSharedCommentInputSchema = z.object({
  token: z.string().min(16),
  itemId: z.number().int().positive(),
  itemTipo: z.enum(agendaItemTipoOptions),
  comentario: z.string().trim().min(2).max(1000),
});

export const prazoSaveInputSchema = z.object({
  prazoId: z.number().int().positive().optional(),
  processoId: z.number().int().positive(),
  tipo: z.enum(prazoProcessualTipoOptions),
  titulo: z.string().trim().min(3).max(200),
  dataPrevista: z.string().min(8),
  responsavelId: z.number().int().positive().optional(),
  observacao: z.string().trim().max(1000).optional(),
  lembretes: z.array(z.number().int().nonnegative()).default([7, 3, 1]),
});

export const prazoConcluirInputSchema = z.object({
  prazoId: z.number().int().positive(),
  dataRealizada: z.string().min(8).optional(),
  observacaoConclusao: z.string().trim().max(1000).optional(),
  arquivarTarefasRelacionadas: z.boolean().optional(),
});

export const prazoDeleteInputSchema = z.object({
  prazoId: z.number().int().positive(),
});

export const tarefaEquipeSaveInputSchema = z.object({
  tarefaId: z.number().int().positive().optional(),
  processoId: z.number().int().positive().optional().nullable(),
  prazoId: z.number().int().positive().optional().nullable(),
  titulo: z.string().trim().min(3).max(200),
  descricao: z.string().trim().max(2000).optional(),
  dataEntrega: z.string().min(8),
  responsavelId: z.number().int().positive(),
  prioridade: z.enum(tarefaEquipePrioridadeOptions).default("MEDIA"),
  status: z.enum(tarefaEquipeStatusOptions).default("PENDENTE"),
  notificarResponsavel: z.boolean().default(true),
});

export const tarefaEquipeStatusInputSchema = z.object({
  tarefaId: z.number().int().positive(),
  status: z.enum(tarefaEquipeStatusOptions),
  comentario: z.string().trim().max(1000).optional(),
  dataEntrega: z.string().min(8).optional(),
});

export const tarefaEquipeDeleteInputSchema = z.object({
  tarefaId: z.number().int().positive(),
});

export const tarefaEquipeBulkInputSchema = z.object({
  tarefaIds: z.array(z.number().int().positive()).min(1).max(200),
  acao: z.enum(["CONCLUIR", "DELEGAR", "REAGENDAR"]),
  responsavelId: z.number().int().positive().optional(),
  dataEntrega: z.string().min(8).optional(),
  comentario: z.string().trim().max(1000).optional(),
});

export type PrazoListInput = z.infer<typeof prazoListInputSchema>;
export type PrazoAgendaListInput = z.infer<typeof prazoAgendaListInputSchema>;
export type AgendaShareFilters = z.infer<typeof agendaShareFiltersSchema>;
export type AgendaShareCreateInput = z.infer<typeof agendaShareCreateInputSchema>;
export type AgendaShareResolveInput = z.infer<typeof agendaShareResolveInputSchema>;
export type AgendaSharedListInput = z.infer<typeof agendaSharedListInputSchema>;
export type AgendaSharedCommentInput = z.infer<typeof agendaSharedCommentInputSchema>;
export type PrazoSaveInput = z.infer<typeof prazoSaveInputSchema>;
export type TarefaEquipeSaveInput = z.infer<typeof tarefaEquipeSaveInputSchema>;
