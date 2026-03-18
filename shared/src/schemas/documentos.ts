import { z } from "zod";

export const documentoTipoOptions = [
  "DFD",
  "ETP",
  "TR",
  "EDITAL",
  "COMUNICACAO_INTERNA",
  "RESULTADO",
  "CONTRATO",
  "OUTRO",
] as const;

export const documentoAccessRoleOptions = ["admin", "gestor", "operador", "auditor", "user"] as const;

export const documentoListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  processoId: z.number().int().positive().optional(),
  search: z.string().trim().optional(),
  tipo: z.enum(documentoTipoOptions).optional(),
  categoria: z.string().trim().optional(),
  publico: z.boolean().optional(),
  dataInicial: z.string().optional(),
  dataFinal: z.string().optional(),
});

export const documentoDetailInputSchema = z.object({
  documentoId: z.number().int().positive(),
});

export const documentoMetadataInputSchema = z.object({
  documentoId: z.number().int().positive(),
  titulo: z.string().trim().min(3).max(255),
  descricao: z.string().trim().max(1000).optional(),
  categoria: z.string().trim().max(120).optional(),
  dataReferencia: z.string().optional(),
  palavrasChave: z.array(z.string().trim().min(1).max(50)).default([]),
  publico: z.boolean().default(false),
  restritoA: z.array(z.enum(documentoAccessRoleOptions)).default([]),
});

export type DocumentoListInput = z.infer<typeof documentoListInputSchema>;
export type DocumentoMetadataInput = z.infer<typeof documentoMetadataInputSchema>;
