import { z } from "zod";

export const itemListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  ativo: z.boolean().optional(),
  vigente: z.boolean().optional(),
  comSaldo: z.boolean().optional(),
});

export const itemDetailInputSchema = z.object({
  itemId: z.number().int().positive(),
});

export const itemSaveInputSchema = z.object({
  itemId: z.number().int().positive().optional(),
  descricao: z.string().trim().min(3, "Informe a descricao do item."),
  unidadePadrao: z.string().trim().min(1, "Informe a unidade padrao."),
  valorReferencia: z.number().nonnegative().optional(),
  ativo: z.boolean().default(true),
});

export const itemDeleteInputSchema = z.object({
  itemId: z.number().int().positive(),
});

export const itemToggleInputSchema = z.object({
  itemId: z.number().int().positive(),
  ativo: z.boolean(),
});

export const contratoItemSaveInputSchema = z.object({
  contratoItemId: z.number().int().positive().optional(),
  itemId: z.number().int().positive(),
  contratoId: z.number().int().positive(),
  descricao: z.string().trim().min(3, "Informe a descricao do controle de saldo."),
  unidade: z.string().trim().min(1, "Informe a unidade."),
  quantidadeContratada: z.number().positive("Informe a quantidade contratada."),
  quantidadeConsumida: z.number().nonnegative("Informe a quantidade consumida."),
  valorUnitario: z.number().nonnegative().optional(),
  ativo: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.quantidadeConsumida > value.quantidadeContratada) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quantidadeConsumida"],
      message: "A quantidade consumida nao pode ser maior que a contratada.",
    });
  }
});

export const contratoItemDeleteInputSchema = z.object({
  contratoItemId: z.number().int().positive(),
  itemId: z.number().int().positive(),
});

export type ItemListInput = z.infer<typeof itemListInputSchema>;
export type ItemDetailInput = z.infer<typeof itemDetailInputSchema>;
export type ItemSaveInput = z.infer<typeof itemSaveInputSchema>;
export type ContratoItemSaveInput = z.infer<typeof contratoItemSaveInputSchema>;
