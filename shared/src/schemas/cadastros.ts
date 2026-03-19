import { z } from "zod";

export const cadastroEntityOptions = [
  "itens",
  "fornecedores",
  "secretarias",
  "pessoas",
  "servidores",
  "departamentos",
  "usuarios",
  "parametros",
] as const;

export const cadastroStatusOptions = ["ativo", "inativo"] as const;

export const cadastrosListInputSchema = z.object({
  entity: z.enum(cadastroEntityOptions),
  search: z.string().trim().optional(),
  status: z.enum(cadastroStatusOptions).optional(),
  secretariaId: z.number().int().positive().optional(),
  role: z.enum(["user", "admin", "gestor", "operador", "auditor"]).optional(),
  cidade: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export const itemCadastroSchema = z.object({
  id: z.number().int().positive().optional(),
  descricao: z.string().trim().min(3, "Informe a descrição do item."),
  unidadePadrao: z.string().trim().min(1, "Informe a unidade padrão.").max(32),
  valorReferencia: z.number().nonnegative().nullable().optional(),
  ativo: z.boolean().default(true),
});

export const fornecedorCadastroSchema = z.object({
  id: z.number().int().positive().optional(),
  razaoSocial: z.string().trim().min(3, "Informe a razão social."),
  cnpj: z.string().trim().min(14, "Informe o CNPJ."),
  email: z.string().trim().email("Informe um e-mail válido.").optional().or(z.literal("")),
  telefone: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  estado: z.string().trim().max(2).optional(),
  ativo: z.boolean().default(true),
}).superRefine((value, ctx) => {
  const cnpjDigits = value.cnpj.replace(/\D/g, "");
  if (cnpjDigits.length !== 14) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cnpj"],
      message: "Informe um CNPJ válido com 14 dígitos.",
    });
  }

  const telefoneDigits = value.telefone?.replace(/\D/g, "") ?? "";
  if (telefoneDigits && telefoneDigits.length < 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["telefone"],
      message: "Informe um telefone válido com DDD.",
    });
  }

  const estado = value.estado?.trim() ?? "";
  if (estado && estado.length !== 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["estado"],
      message: "Informe a UF com 2 letras.",
    });
  }
});

export const secretariaCadastroSchema = z.object({
  id: z.number().int().positive().optional(),
  sigla: z.string().trim().min(2, "Informe a sigla.").max(32).regex(/^[A-Z0-9-]+$/, "Use letras maiúsculas, números ou hífen."),
  nome: z.string().trim().min(3, "Informe o nome da secretaria."),
  descricao: z.string().trim().optional(),
  responsavel: z.string().trim().optional(),
  email: z.string().trim().email("Informe um e-mail válido.").optional().or(z.literal("")),
  telefone: z.string().trim().optional(),
  ativo: z.boolean().default(true),
});

export const pessoaCadastroSchema = z.object({
  id: z.number().int().positive().optional(),
  nome: z.string().trim().min(3, "Informe o nome da pessoa."),
  cpf: z.string().trim().optional(),
  cargo: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional().nullable(),
  ativo: z.boolean().default(true),
}).superRefine((value, ctx) => {
  const cpfDigits = value.cpf?.replace(/\D/g, "") ?? "";
  if (cpfDigits && cpfDigits.length !== 11) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cpf"],
      message: "Informe um CPF válido com 11 dígitos.",
    });
  }
});

export const servidorCadastroSchema = pessoaCadastroSchema.superRefine((value, ctx) => {
  if (!value.secretariaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["secretariaId"],
      message: "Vincule o servidor a uma secretaria.",
    });
  }
});

export const departamentoCadastroSchema = z.object({
  id: z.number().int().positive().optional(),
  nome: z.string().trim().min(3, "Informe o nome do departamento."),
  codigoCentroCusto: z.string().trim().optional(),
  secretariaId: z.number().int().positive("Selecione a secretaria."),
  responsavelId: z.number().int().positive().optional().nullable(),
  descricao: z.string().trim().optional(),
  ativo: z.boolean().default(true),
});

export const usuarioCadastroSchema = z.object({
  id: z.number().int().positive().optional(),
  username: z.string().trim().min(3).max(80).optional(),
  name: z.string().trim().min(3, "Informe o nome do usuário."),
  email: z.string().trim().email("Informe um e-mail válido.").optional().or(z.literal("")),
  role: z.enum(["user", "admin", "gestor", "operador", "auditor"]),
  secretariaId: z.number().int().positive().optional().nullable(),
  ativo: z.boolean().default(true),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(120).optional(),
}).superRefine((value, ctx) => {
  if (!value.id && !value.username) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["username"],
      message: "Informe o login do usuário.",
    });
  }

  if (!value.id && !value.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "Informe a senha inicial do usuário.",
    });
  }

  if (["operador", "gestor"].includes(value.role) && !value.secretariaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["secretariaId"],
      message: "Vincule o usuário a uma secretaria para este perfil.",
    });
  }
});

export const parametroCadastroSchema = z.object({
  id: z.number().int().positive().optional(),
  categoria: z.string().trim().min(2, "Informe a categoria."),
  chave: z.string().trim().min(2, "Informe a chave do parâmetro."),
  valor: z.string().trim().min(1, "Informe o valor do parâmetro."),
  descricao: z.string().trim().optional(),
  ativo: z.boolean().default(true),
});

export const cadastroSaveInputSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("itens"), data: itemCadastroSchema }),
  z.object({ entity: z.literal("fornecedores"), data: fornecedorCadastroSchema }),
  z.object({ entity: z.literal("secretarias"), data: secretariaCadastroSchema }),
  z.object({ entity: z.literal("pessoas"), data: pessoaCadastroSchema }),
  z.object({ entity: z.literal("servidores"), data: servidorCadastroSchema }),
  z.object({ entity: z.literal("departamentos"), data: departamentoCadastroSchema }),
  z.object({ entity: z.literal("usuarios"), data: usuarioCadastroSchema }),
  z.object({ entity: z.literal("parametros"), data: parametroCadastroSchema }),
]);

export const cadastroDeleteInputSchema = z.object({
  entity: z.enum(cadastroEntityOptions),
  id: z.number().int().positive(),
});

export const cadastroHistoryInputSchema = z.object({
  entity: z.enum(cadastroEntityOptions),
  id: z.number().int().positive(),
  action: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),
  search: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(10),
});

export const cadastroBulkStatusInputSchema = z.object({
  entity: z.enum(cadastroEntityOptions),
  ids: z.array(z.number().int().positive()).min(1).max(200),
  ativo: z.boolean(),
});

export const cadastroExportInputSchema = cadastrosListInputSchema.extend({
  ids: z.array(z.number().int().positive()).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(5000).default(5000),
});

export type CadastroEntity = (typeof cadastroEntityOptions)[number];
export type CadastroStatus = (typeof cadastroStatusOptions)[number];
export type CadastrosListInput = z.infer<typeof cadastrosListInputSchema>;
export type CadastroSaveInput = z.infer<typeof cadastroSaveInputSchema>;
export type CadastroDeleteInput = z.infer<typeof cadastroDeleteInputSchema>;
export type CadastroHistoryInput = z.infer<typeof cadastroHistoryInputSchema>;
export type CadastroBulkStatusInput = z.infer<typeof cadastroBulkStatusInputSchema>;
export type CadastroExportInput = z.infer<typeof cadastroExportInputSchema>;
