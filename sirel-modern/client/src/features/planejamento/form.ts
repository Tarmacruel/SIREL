import { dfdSaveInputSchema } from "@sirel/shared/schemas/planejamento";

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
