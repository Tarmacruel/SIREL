import { z } from "zod";

import { grauPrioridadeOptions, metodologiaCotacaoOptions } from "../const.js";

export const planejamentoListInputSchema = z.object({
  search: z.string().trim().optional(),
  somenteSemDfd: z.boolean().optional(),
});

export const dfdSaveInputSchema = z
  .object({
    processoId: z.number().int().positive(),
    setorDemandante: z.string().trim().min(3).max(255),
    grauPrioridade: z.enum(grauPrioridadeOptions),
    demandaSistemica: z.boolean().default(false),
    secretariasParticipantes: z.array(z.number().int().positive()).default([]),
    justificativa: z.string().trim().min(10),
    observacoes: z.string().trim().max(4000).optional(),
    responsavelIds: z.array(z.number().int().positive()).min(1),
    dataNecessidade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dataPrevistaConclusao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    concluir: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const participantesUnicos = Array.from(new Set(value.secretariasParticipantes));
    if (value.demandaSistemica && participantesUnicos.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secretariasParticipantes"],
        message: "Selecione pelo menos duas secretarias participantes para demanda sistemica.",
      });
    }

    const dataNecessidade = new Date(`${value.dataNecessidade}T00:00:00`);
    const dataPrevistaConclusao = new Date(`${value.dataPrevistaConclusao}T00:00:00`);
    if (dataPrevistaConclusao < dataNecessidade) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataPrevistaConclusao"],
        message: "A data prevista para conclusao deve ser igual ou posterior a data da necessidade.",
      });
    }
  });

export const dfdItemSaveInputSchema = z.object({
  processoId: z.number().int().positive(),
  itemId: z.number().int().positive().optional(),
  descricao: z.string().trim().min(3).max(4000),
  quantidade: z.number().positive(),
  unidade: z.string().trim().min(1).max(32),
});

export const dfdItemDeleteInputSchema = z.object({
  processoId: z.number().int().positive(),
  itemId: z.number().int().positive(),
});

export const dfdDeleteInputSchema = z.object({
  processoId: z.number().int().positive(),
});

export const catalogoItemListInputSchema = z.object({
  search: z.string().trim().optional(),
});

export const catalogoItemCreateInputSchema = z.object({
  descricao: z.string().trim().min(3).max(4000),
  unidadePadrao: z.string().trim().min(1).max(32),
});

export const dfdCatalogItemsAddInputSchema = z.object({
  processoId: z.number().int().positive(),
  itens: z.array(z.object({
    catalogoItemId: z.number().int().positive(),
    quantidade: z.number().positive(),
    unidade: z.string().trim().min(1).max(32),
  })).min(1),
});

export const etpSaveInputSchema = z.object({
  processoId: z.number().int().positive(),
  metodologiaCotacao: z.enum(metodologiaCotacaoOptions).default("MEDIA"),
  descricaoNecessidade: z.string().trim().max(6000).optional(),
  analiseSolucoesMercado: z.string().trim().max(6000).optional(),
  justificativaTecnica: z.string().trim().max(6000).optional(),
  providenciasPrevias: z.string().trim().max(4000).optional(),
  conclusaoViabilidade: z.string().trim().max(6000).optional(),
  observacoes: z.string().trim().max(4000).optional(),
  concluir: z.boolean().default(false),
});

export const etpCotacaoSaveInputSchema = z.object({
  processoId: z.number().int().positive(),
  cotacaoId: z.number().int().positive().optional(),
  itemId: z.number().int().positive(),
  fonte: z.string().trim().min(2).max(255),
  fornecedorNome: z.string().trim().min(2).max(255),
  documento: z.string().trim().max(80).optional(),
  dataCotacao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  quantidadeConsiderada: z.number().positive(),
  valorUnitario: z.number().positive(),
  considerada: z.boolean().default(true),
  motivoDesconsideracao: z.enum(["SOBREPRECO", "INEXEQUIVEL", "OUTRO"]).optional(),
  justificativaDesconsideracao: z.string().trim().max(4000).optional(),
  observacao: z.string().trim().max(4000).optional(),
}).superRefine((value, ctx) => {
  if (!value.considerada && !value.motivoDesconsideracao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["motivoDesconsideracao"],
      message: "Informe o motivo da desconsideracao da cotacao.",
    });
  }
  if (!value.considerada && !value.justificativaDesconsideracao?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["justificativaDesconsideracao"],
      message: "Registre a justificativa para desconsiderar a cotacao.",
    });
  }
});

export const etpCotacaoDeleteInputSchema = z.object({
  processoId: z.number().int().positive(),
  cotacaoId: z.number().int().positive(),
});

export type PlanejamentoListInput = z.infer<typeof planejamentoListInputSchema>;
export type DfdSaveInput = z.infer<typeof dfdSaveInputSchema>;
export type DfdItemSaveInput = z.infer<typeof dfdItemSaveInputSchema>;
export type DfdItemDeleteInput = z.infer<typeof dfdItemDeleteInputSchema>;
export type DfdDeleteInput = z.infer<typeof dfdDeleteInputSchema>;
export type CatalogoItemListInput = z.infer<typeof catalogoItemListInputSchema>;
export type CatalogoItemCreateInput = z.infer<typeof catalogoItemCreateInputSchema>;
export type DfdCatalogItemsAddInput = z.infer<typeof dfdCatalogItemsAddInputSchema>;
export type EtpSaveInput = z.infer<typeof etpSaveInputSchema>;
export type EtpCotacaoSaveInput = z.infer<typeof etpCotacaoSaveInputSchema>;
export type EtpCotacaoDeleteInput = z.infer<typeof etpCotacaoDeleteInputSchema>;
