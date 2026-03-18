import { z } from "zod";

import { workflowModuleOptions } from "../const.js";

export const consultaSearchInputSchema = z.object({
  termo: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  modalidadeId: z.number().int().positive().optional(),
  statusId: z.number().int().positive().optional(),
  moduloAtual: z.enum(workflowModuleOptions).optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  valorMin: z.number().nonnegative().optional(),
  valorMax: z.number().nonnegative().optional(),
  somenteComDocumentos: z.boolean().optional(),
  pagina: z.number().int().positive().default(1),
  limite: z.number().int().positive().max(100).default(10),
});

export type ConsultaSearchInput = z.infer<typeof consultaSearchInputSchema>;
