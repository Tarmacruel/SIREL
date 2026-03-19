import { z } from "zod";

import { modoDisputaOptions, workflowModuleOptions } from "../const.js";

export const processoListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  statusId: z.number().int().positive().optional(),
  moduloAtual: z.string().optional(),
  situacao: z.string().optional(),
  foraDoFluxo: z.boolean().optional(),
  paradosHaMaisDeSeteDias: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export const processoCreateInputSchema = z
  .object({
    numeroAdministrativo: z.string().max(64).optional(),
    anoReferencia: z.number().int().gte(2020).lte(2100),
    secretariaId: z.number().int().positive(),
    modalidadeId: z.number().int().positive().optional(),
    statusId: z.number().int().positive().optional(),
    autoridadeCompetenteId: z.number().int().positive().optional(),
    objeto: z.string().min(10),
    valorEstimado: z.number().nonnegative().optional(),
    escopoDisputa: z.enum(["ITEM", "LOTE", "GLOBAL"]).optional(),
    criterioJulgamento: z.string().max(120).optional(),
    modoDisputa: z.enum(modoDisputaOptions).optional(),
    tipoObjeto: z.enum(["PRODUTO", "SERVICO", "OBRA", "SERVICO_ENG"]).optional(),
    tipoContratacao: z.enum(["AQUISICAO", "REGISTRO_PRECO", "AQUISICAO_PARCELADA"]).optional(),
    dataAbertura: z.string().optional(),
    foraDoFluxo: z.boolean().default(false),
    moduloInicial: z.enum(workflowModuleOptions).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.foraDoFluxo && !value.moduloInicial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["moduloInicial"],
        message: "Selecione o modulo inicial para processos fora do fluxo.",
      });
    }
    if (!value.foraDoFluxo && value.moduloInicial && value.moduloInicial !== "PLANEJAMENTO") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["moduloInicial"],
        message: "Processos no fluxo regular devem iniciar no Planejamento.",
      });
    }
  });

export const processoSetAtivoInputSchema = z.object({
  processoId: z.number().int().positive(),
  ativo: z.boolean(),
});

export type ProcessoListInput = z.infer<typeof processoListInputSchema>;
export type ProcessoCreateInput = z.infer<typeof processoCreateInputSchema>;
export type ProcessoSetAtivoInput = z.infer<typeof processoSetAtivoInputSchema>;
