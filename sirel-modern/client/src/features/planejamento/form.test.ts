import { describe, expect, it } from "vitest";

import { validateDfdForm } from "@/features/planejamento/form";

describe("dfd form", () => {
  it("rejects systemic demand without at least two participant secretarias", () => {
    const result = validateDfdForm(1, {
      setorDemandante: "Setor de Compras",
      grauPrioridade: "ALTA",
      demandaSistemica: true,
      secretariasParticipantes: [1],
      justificativa: "Justificativa suficiente para atender a validacao da DFD.",
      observacoes: "",
      responsavelIds: [1],
      dataNecessidade: "2026-04-01",
      dataPrevistaConclusao: "2026-04-02",
      concluir: false,
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid DFD payload", () => {
    const result = validateDfdForm(1, {
      setorDemandante: "Setor de Compras",
      grauPrioridade: "ALTA",
      demandaSistemica: true,
      secretariasParticipantes: [1, 2],
      justificativa: "Justificativa suficiente para atender a validacao da DFD.",
      observacoes: "Observacoes complementares.",
      responsavelIds: [1, 2],
      dataNecessidade: "2026-04-01",
      dataPrevistaConclusao: "2026-04-10",
      concluir: true,
    });

    expect(result.success).toBe(true);
  });
});
