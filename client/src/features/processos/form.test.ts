import { describe, expect, it } from "vitest";

import { buildProcessoPayload, validateProcessoForm } from "@/features/processos/form";

const baseForm = {
  numeroAdministrativo: "123/2026",
  anoReferencia: "2026",
  secretariaId: "1",
  modalidadeId: "2",
  statusId: "3",
  autoridadeCompetenteId: "4",
  numeroEdital: "1/2026",
  objeto: "Contratacao de empresa especializada para atendimento das demandas da secretaria.",
  valorEstimado: "10.000,50",
  escopoDisputa: "GLOBAL",
  criterioJulgamento: "MENOR PRECO",
  modoDisputa: "NAO_SE_APLICA",
  tipoObjeto: "PRODUTO",
  tipoContratacao: "AQUISICAO",
  dataAbertura: "2026-04-01",
  dataPublicacao: "2026-03-20",
  dataDisputaSessao: "2026-04-01T09:00",
  situacao: "RASCUNHO",
  foraDoFluxo: false,
  moduloInicial: "DOCUMENTOS",
} as const;

describe("processo form", () => {
  it("normalizes numeric values before validation", () => {
    const payload = buildProcessoPayload({ ...baseForm });
    expect(payload.valorEstimado).toBe(10000.5);
    expect(payload.secretariaId).toBe(1);
  });

  it("ignores custom initial module for regular process", () => {
    const result = validateProcessoForm({ ...baseForm, foraDoFluxo: false, moduloInicial: "DOCUMENTOS" });
    expect(result.success).toBe(true);
  });

  it("requires initial module for out-of-flow process", () => {
    const result = validateProcessoForm({ ...baseForm, foraDoFluxo: true, moduloInicial: "" });
    expect(result.success).toBe(false);
  });
});
