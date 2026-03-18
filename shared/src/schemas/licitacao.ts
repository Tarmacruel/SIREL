import { z } from "zod";

import {
  habilitacaoStatusOptions,
  licitacaoStatusOptions,
  propostaSituacaoOptions,
  recursoResultadoOptions,
} from "../const.js";

const optionalDateTimeString = z.string().trim().min(1).max(40).optional();
const optionalDateString = z.string().trim().min(1).max(20).optional();

export const licitacaoListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(12),
  search: z.string().trim().optional(),
  statusLicitacao: z.enum(licitacaoStatusOptions).optional(),
  publicado: z.boolean().optional(),
});

export const licitacaoDetailInputSchema = z.object({
  processoId: z.number().int().positive(),
});

export const licitacaoSaveConfiguracaoInputSchema = z.object({
  processoId: z.number().int().positive(),
  criterioJulgamento: z.string().trim().max(120).optional(),
  modoDisputa: z.string().trim().max(120).optional(),
  dataPublicacaoEdital: optionalDateTimeString,
  dataRecebimentoPropostasInicio: optionalDateTimeString,
  dataRecebimentoPropostasFim: optionalDateTimeString,
  dataAberturaPropostas: optionalDateTimeString,
  dataInicioLances: optionalDateTimeString,
  dataFimLances: optionalDateTimeString,
  dataJulgamento: optionalDateTimeString,
  observacoes: z.string().trim().max(4000).optional(),
});

export const licitacaoPublishInputSchema = z.object({
  processoId: z.number().int().positive(),
  condutorProcessoId: z.number().int().positive(),
  statusId: z.number().int().positive().optional(),
  dataPublicacaoEdital: optionalDateTimeString,
  dataRecebimentoPropostasInicio: optionalDateTimeString,
  dataRecebimentoPropostasFim: optionalDateTimeString,
  dataAberturaPropostas: optionalDateTimeString,
  dataInicioLances: optionalDateTimeString,
  dataFimLances: optionalDateTimeString,
  descricao: z.string().trim().min(3).max(255).optional(),
  observacao: z.string().trim().max(2000).optional(),
});

export const licitacaoSaveLicitanteInputSchema = z.object({
  processoId: z.number().int().positive(),
  fornecedorId: z.number().int().positive(),
});

export const licitacaoDeleteLicitanteInputSchema = z.object({
  licitanteId: z.number().int().positive(),
});

export const licitacaoSavePropostaInputSchema = z.object({
  processoId: z.number().int().positive(),
  propostaId: z.number().int().positive().optional(),
  licitanteId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  valorUnitarioProposto: z.number().positive(),
  dataProposta: optionalDateTimeString,
  classificacao: z.number().int().positive().optional(),
  situacao: z.enum(propostaSituacaoOptions).default("VALIDA"),
  justificativa: z.string().trim().max(2000).optional(),
});

export const licitacaoSaveLanceInputSchema = z.object({
  propostaId: z.number().int().positive(),
  valorLance: z.number().positive(),
  dataLance: optionalDateTimeString,
  observacao: z.string().trim().max(1000).optional(),
});

export const licitacaoSaveHabilitacaoInputSchema = z.object({
  licitanteId: z.number().int().positive(),
  statusHabilitacao: z.enum(habilitacaoStatusOptions),
  observacaoHabilitacao: z.string().trim().max(2000).optional(),
});

export const licitacaoSaveRecursoInputSchema = z.object({
  processoId: z.number().int().positive(),
  recursoId: z.number().int().positive().optional(),
  licitanteId: z.number().int().positive(),
  dataInterposicao: optionalDateString,
  dataJulgamento: optionalDateString,
  resultado: z.enum(recursoResultadoOptions).default("PENDENTE"),
  descricao: z.string().trim().min(3).max(4000),
  decisao: z.string().trim().max(4000).optional(),
});

export const licitacaoAdvanceStageInputSchema = z.object({
  processoId: z.number().int().positive(),
  statusLicitacao: z.enum(licitacaoStatusOptions),
  etapaAtual: z.string().trim().min(3).max(255),
  observacao: z.string().trim().max(2000).optional(),
});

export const licitacaoHomologarInputSchema = z.object({
  processoId: z.number().int().positive(),
  dataHomologacao: optionalDateString,
  observacao: z.string().trim().max(2000).optional(),
  statusId: z.number().int().positive().optional(),
});

export type LicitacaoListInput = z.infer<typeof licitacaoListInputSchema>;
export type LicitacaoDetailInput = z.infer<typeof licitacaoDetailInputSchema>;
export type LicitacaoSaveConfiguracaoInput = z.infer<typeof licitacaoSaveConfiguracaoInputSchema>;
export type LicitacaoPublishInput = z.infer<typeof licitacaoPublishInputSchema>;
export type LicitacaoSaveLicitanteInput = z.infer<typeof licitacaoSaveLicitanteInputSchema>;
export type LicitacaoDeleteLicitanteInput = z.infer<typeof licitacaoDeleteLicitanteInputSchema>;
export type LicitacaoSavePropostaInput = z.infer<typeof licitacaoSavePropostaInputSchema>;
export type LicitacaoSaveLanceInput = z.infer<typeof licitacaoSaveLanceInputSchema>;
export type LicitacaoSaveHabilitacaoInput = z.infer<typeof licitacaoSaveHabilitacaoInputSchema>;
export type LicitacaoSaveRecursoInput = z.infer<typeof licitacaoSaveRecursoInputSchema>;
export type LicitacaoAdvanceStageInput = z.infer<typeof licitacaoAdvanceStageInputSchema>;
export type LicitacaoHomologarInput = z.infer<typeof licitacaoHomologarInputSchema>;
