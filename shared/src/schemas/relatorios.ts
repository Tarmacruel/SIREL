import { z } from "zod";

import { relatorioTipoOptions } from "../const.js";

export const relatorioRunInputSchema = z.object({
  tipo: z.enum(relatorioTipoOptions),
  dataInicial: z.string().trim().optional(),
  dataFinal: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  modalidadeId: z.number().int().positive().optional(),
  statusId: z.number().int().positive().optional(),
});

export type RelatorioRunInput = z.infer<typeof relatorioRunInputSchema>;
