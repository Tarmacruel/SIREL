import { processoCreateInputSchema } from "@sirel/shared/schemas/processos";

export interface ProcessoFormState {
  numeroAdministrativo: string;
  anoReferencia: string;
  secretariaId: string;
  modalidadeId: string;
  statusId: string;
  autoridadeCompetenteId: string;
  objeto: string;
  valorEstimado: string;
  escopoDisputa: string;
  criterioJulgamento: string;
  modoDisputa: string;
  tipoObjeto: string;
  tipoContratacao: string;
  dataAbertura: string;
  foraDoFluxo: boolean;
  moduloInicial: string;
}

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toOptionalNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildProcessoPayload(form: ProcessoFormState) {
  return {
    numeroAdministrativo: form.numeroAdministrativo.trim() || undefined,
    anoReferencia: Number(form.anoReferencia),
    secretariaId: Number(form.secretariaId),
    modalidadeId: toOptionalId(form.modalidadeId),
    statusId: toOptionalId(form.statusId),
    autoridadeCompetenteId: toOptionalId(form.autoridadeCompetenteId),
    objeto: form.objeto.trim(),
    valorEstimado: toOptionalNumber(form.valorEstimado),
    escopoDisputa: form.escopoDisputa as "ITEM" | "LOTE" | "GLOBAL",
    criterioJulgamento: form.criterioJulgamento.trim() || undefined,
    modoDisputa: form.modoDisputa as "NAO_SE_APLICA" | "ABERTO" | "FECHADO" | "ABERTO_FECHADO" | "FECHADO_ABERTO",
    tipoObjeto: form.tipoObjeto as "PRODUTO" | "SERVICO" | "OBRA" | "SERVICO_ENG",
    tipoContratacao: form.tipoContratacao as "AQUISICAO" | "REGISTRO_PRECO" | "AQUISICAO_PARCELADA",
    dataAbertura: form.dataAbertura || undefined,
    foraDoFluxo: form.foraDoFluxo,
    moduloInicial: form.foraDoFluxo ? (form.moduloInicial as any) : undefined,
  };
}

export function validateProcessoForm(form: ProcessoFormState) {
  return processoCreateInputSchema.safeParse(buildProcessoPayload(form));
}
