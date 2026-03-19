import {
  departamentoCadastroSchema,
  fornecedorCadastroSchema,
  itemCadastroSchema,
  parametroCadastroSchema,
  secretariaCadastroSchema,
  usuarioCadastroSchema,
  type CadastroEntity,
} from "@sirel/shared/schemas/cadastros";

import { normalizeDecimalInput } from "@/lib/formatters";

export type CadastroFormState = Record<string, any>;
export type CadastroFormErrors = Record<string, string>;

function digitsOnly(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function maskCnpj(value: string | null | undefined) {
  const digits = digitsOnly(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\/\d{4})(\d)/, "$1-$2");
}

export function maskPhone(value: string | null | undefined) {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  return digits.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
}

export function maskCep(value: string | null | undefined) {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.replace(/^(\d{5})(\d+)/, "$1-$2");
}

export function buildCadastroPayload(entity: CadastroEntity, form: CadastroFormState, editingId?: number | null) {
  switch (entity) {
    case "itens":
      return {
        id: editingId ?? undefined,
        descricao: String(form.descricao ?? "").trim(),
        unidadePadrao: String(form.unidadePadrao ?? "").trim().toUpperCase(),
        valorReferencia: form.valorReferencia === "" ? null : normalizeDecimalInput(String(form.valorReferencia ?? "")) ?? null,
        ativo: Boolean(form.ativo),
      };
    case "fornecedores":
      return {
        id: editingId ?? undefined,
        razaoSocial: String(form.razaoSocial ?? "").trim(),
        cnpj: digitsOnly(form.cnpj),
        email: String(form.email ?? "").trim(),
        telefone: maskPhone(form.telefone),
        cidade: String(form.cidade ?? "").trim(),
        estado: String(form.estado ?? "").trim().toUpperCase(),
        ativo: Boolean(form.ativo),
      };
    case "secretarias":
      return {
        id: editingId ?? undefined,
        sigla: String(form.sigla ?? "").trim().toUpperCase(),
        nome: String(form.nome ?? "").trim(),
        responsavel: String(form.responsavel ?? "").trim(),
        email: String(form.email ?? "").trim(),
        telefone: maskPhone(form.telefone),
        descricao: String(form.descricao ?? "").trim(),
        ativo: Boolean(form.ativo),
      };
    case "departamentos":
      return {
        id: editingId ?? undefined,
        nome: String(form.nome ?? "").trim(),
        codigoCentroCusto: String(form.codigoCentroCusto ?? "").trim().toUpperCase(),
        secretariaId: Number(form.secretariaId),
        responsavelId: form.responsavelId ? Number(form.responsavelId) : null,
        descricao: String(form.descricao ?? "").trim(),
        ativo: Boolean(form.ativo),
      };
    case "usuarios":
      return {
        id: editingId ?? undefined,
        username: editingId ? undefined : String(form.username ?? "").trim(),
        name: String(form.name ?? "").trim(),
        email: String(form.email ?? "").trim(),
        role: form.role,
        secretariaId: form.secretariaId ? Number(form.secretariaId) : null,
        password: editingId ? undefined : String(form.password ?? ""),
        ativo: Boolean(form.ativo),
      };
    case "parametros":
      return {
        id: editingId ?? undefined,
        categoria: String(form.categoria ?? "").trim().toUpperCase(),
        chave: String(form.chave ?? "").trim().toUpperCase(),
        valor: String(form.valor ?? "").trim(),
        descricao: String(form.descricao ?? "").trim(),
        ativo: Boolean(form.ativo),
      };
  }
}

function getSchema(entity: CadastroEntity) {
  switch (entity) {
    case "itens":
      return itemCadastroSchema;
    case "fornecedores":
      return fornecedorCadastroSchema;
    case "secretarias":
      return secretariaCadastroSchema;
    case "departamentos":
      return departamentoCadastroSchema;
    case "usuarios":
      return usuarioCadastroSchema;
    case "parametros":
      return parametroCadastroSchema;
  }
}

export function validateCadastroForm(entity: CadastroEntity, form: CadastroFormState, editingId?: number | null) {
  const payload = buildCadastroPayload(entity, form, editingId);
  const result = getSchema(entity).safeParse(payload);

  if (result.success) {
    return { success: true as const, data: result.data, errors: {} as CadastroFormErrors };
  }

  const errors: CadastroFormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }

  return { success: false as const, errors };
}
