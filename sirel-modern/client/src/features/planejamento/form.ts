import {
  dfdSaveInputSchema,
  etpCotacaoSaveInputSchema,
  etpSaveInputSchema,
} from "@sirel/shared/schemas/planejamento";

export interface DfdFormState {
  setorDemandante: string;
  grauPrioridade: string;
  demandaSistemica: boolean;
  secretariasParticipantes: number[];
  justificativa: string;
  observacoes: string;
  responsavelIds: number[];
  dataNecessidade: string;
  dataPrevistaConclusao: string;
  concluir: boolean;
}

export function buildDfdPayload(processoId: number, form: DfdFormState) {
  return {
    processoId,
    setorDemandante: form.setorDemandante.trim(),
    grauPrioridade: form.grauPrioridade as "BAIXA" | "MEDIA" | "ALTA" | "URGENTE",
    demandaSistemica: form.demandaSistemica,
    secretariasParticipantes: form.secretariasParticipantes,
    justificativa: form.justificativa.trim(),
    observacoes: form.observacoes.trim() || undefined,
    responsavelIds: form.responsavelIds,
    dataNecessidade: form.dataNecessidade,
    dataPrevistaConclusao: form.dataPrevistaConclusao,
    concluir: form.concluir,
  };
}

export function validateDfdForm(processoId: number, form: DfdFormState) {
  return dfdSaveInputSchema.safeParse(buildDfdPayload(processoId, form));
}

export interface EtpFormState {
  metodologiaCotacao: "MENOR_PRECO" | "MEDIA" | "MEDIANA";
  observacoes: string;
  concluir: boolean;
}

export function buildEtpPayload(processoId: number, form: EtpFormState) {
  return {
    processoId,
    metodologiaCotacao: form.metodologiaCotacao,
    observacoes: form.observacoes.trim() || undefined,
    concluir: form.concluir,
  };
}

export function validateEtpForm(processoId: number, form: EtpFormState) {
  return etpSaveInputSchema.safeParse(buildEtpPayload(processoId, form));
}

export interface EtpCotacaoFormState {
  cotacaoId?: number;
  itemId: number;
  fonte: string;
  fornecedorNome: string;
  documento: string;
  dataCotacao: string;
  quantidadeConsiderada: number;
  valorUnitario: number;
  considerada: boolean;
  motivoDesconsideracao?: "SOBREPRECO" | "INEXEQUIVEL" | "OUTRO";
  justificativaDesconsideracao: string;
  observacao: string;
}

export function buildEtpCotacaoPayload(processoId: number, form: EtpCotacaoFormState) {
  return {
    processoId,
    cotacaoId: form.cotacaoId,
    itemId: form.itemId,
    fonte: form.fonte.trim(),
    fornecedorNome: form.fornecedorNome.trim(),
    documento: form.documento.trim() || undefined,
    dataCotacao: form.dataCotacao || undefined,
    quantidadeConsiderada: form.quantidadeConsiderada,
    valorUnitario: form.valorUnitario,
    considerada: form.considerada,
    motivoDesconsideracao: form.considerada ? undefined : form.motivoDesconsideracao,
    justificativaDesconsideracao: form.considerada ? undefined : form.justificativaDesconsideracao.trim() || undefined,
    observacao: form.observacao.trim() || undefined,
  };
}

export function validateEtpCotacaoForm(processoId: number, form: EtpCotacaoFormState) {
  return etpCotacaoSaveInputSchema.safeParse(buildEtpCotacaoPayload(processoId, form));
}
