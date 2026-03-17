import { z } from "zod";

import { grauPrioridadeOptions } from "../const.js";

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

export type PlanejamentoListInput = z.infer<typeof planejamentoListInputSchema>;
export type DfdSaveInput = z.infer<typeof dfdSaveInputSchema>;
export type DfdItemSaveInput = z.infer<typeof dfdItemSaveInputSchema>;
export type DfdItemDeleteInput = z.infer<typeof dfdItemDeleteInputSchema>;
export type DfdDeleteInput = z.infer<typeof dfdDeleteInputSchema>;
export type CatalogoItemListInput = z.infer<typeof catalogoItemListInputSchema>;
export type CatalogoItemCreateInput = z.infer<typeof catalogoItemCreateInputSchema>;
export type DfdCatalogItemsAddInput = z.infer<typeof dfdCatalogItemsAddInputSchema>;
