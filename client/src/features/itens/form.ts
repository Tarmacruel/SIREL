import { contratoItemSaveInputSchema, itemSaveInputSchema } from "@sirel/shared/schemas/itens";

import { normalizeDecimalInput } from "@/lib/formatters";

export interface ItemFormState {
  descricao: string;
  unidadePadrao: string;
  valorReferencia: string;
  ativo: boolean;
}

export interface ContratoItemFormState {
  contratoId: string;
  descricao: string;
  unidade: string;
  quantidadeContratada: string;
  quantidadeConsumida: string;
  valorUnitario: string;
  ativo: boolean;
}

export function buildItemPayload(form: ItemFormState, itemId?: number) {
  return {
    itemId,
    descricao: form.descricao.trim(),
    unidadePadrao: form.unidadePadrao.trim().toUpperCase(),
    valorReferencia: normalizeDecimalInput(form.valorReferencia),
    ativo: form.ativo,
  };
}

export function validateItemForm(form: ItemFormState, itemId?: number) {
  return itemSaveInputSchema.safeParse(buildItemPayload(form, itemId));
}

export function buildContratoItemPayload(form: ContratoItemFormState, itemId: number, contratoItemId?: number) {
  return {
    contratoItemId,
    itemId,
    contratoId: Number(form.contratoId),
    descricao: form.descricao.trim(),
    unidade: form.unidade.trim().toUpperCase(),
    quantidadeContratada: normalizeDecimalInput(form.quantidadeContratada),
    quantidadeConsumida: normalizeDecimalInput(form.quantidadeConsumida) ?? 0,
    valorUnitario: normalizeDecimalInput(form.valorUnitario),
    ativo: form.ativo,
  };
}

export function validateContratoItemForm(form: ContratoItemFormState, itemId: number, contratoItemId?: number) {
  return contratoItemSaveInputSchema.safeParse(buildContratoItemPayload(form, itemId, contratoItemId));
}
