import { z } from "zod";

export const parametroCategoriaOptions = [
  "INSTITUCIONAL",
  "REGRAS",
  "INTEGRACAO",
  "COMPORTAMENTO",
  "CATALOGOS",
] as const;

export const parametroTipoDadoOptions = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "date",
] as const;

export const parametroCategoriaSchema = z.enum(parametroCategoriaOptions);
export const parametroTipoDadoSchema = z.enum(parametroTipoDadoOptions);

export const parametroListInputSchema = z.object({
  categoria: parametroCategoriaSchema.optional(),
  busca: z.string().trim().optional(),
  apenasAtivos: z.boolean().default(true),
});

export const parametroUpdateInputSchema = z.object({
  id: z.number().int().positive(),
  valor: z.unknown(),
  justificativa: z.string().trim().max(1000).optional(),
});

export const parametroObterValorInputSchema = z.object({
  chave: z.string().trim().min(2).max(120),
});

export type ParametroListInput = z.infer<typeof parametroListInputSchema>;
export type ParametroUpdateInput = z.infer<typeof parametroUpdateInputSchema>;
export type ParametroObterValorInput = z.infer<typeof parametroObterValorInputSchema>;
