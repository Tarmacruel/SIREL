import { describe, expect, it } from "vitest";

import { validateDfdForm, validateEtpCotacaoForm, validateEtpForm, validateTrForm } from "@/features/planejamento/form";

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

describe("etp form", () => {
  it("accepts a valid ETP payload", () => {
    const result = validateEtpForm(1, {
      metodologiaCotacao: "MEDIANA",
      observacoes: "ETP externo anexado e apto para a fase de cotacoes preliminares.",
      concluir: true,
    });

    expect(result.success).toBe(true);
  });
});

describe("tr form", () => {
  it("accepts a valid TR stage payload", () => {
    const result = validateTrForm(1, {
      orcamentoSigiloso: true,
      observacoes: "TR externo anexado e etapa pronta para consolidacao documental.",
      concluir: true,
    });

    expect(result.success).toBe(true);
  });
});

describe("etp cotacao form", () => {
  it("rejects invalid preliminary quotation payload", () => {
    const result = validateEtpCotacaoForm(1, {
      itemId: 10,
      fonte: "A",
      fornecedorNome: "",
      documento: "",
      dataCotacao: "2026-05-10",
      quantidadeConsiderada: 0,
      valorUnitario: 0,
      considerada: false,
      motivoDesconsideracao: "OUTRO",
      justificativaDesconsideracao: "",
      observacao: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid preliminary quotation payload", () => {
    const result = validateEtpCotacaoForm(1, {
      cotacaoId: 3,
      itemId: 10,
      fonte: "Painel de Precos",
      fornecedorNome: "Fornecedor Exemplo Ltda",
      documento: "PE-2026-001",
      dataCotacao: "2026-05-10",
      quantidadeConsiderada: 12.5,
      valorUnitario: 1530.44,
      considerada: false,
      motivoDesconsideracao: "SOBREPRECO",
      justificativaDesconsideracao: "Cotacao desconsiderada por possivel sobrepreco em relacao a media das referencias validas.",
      observacao: "Menor valor encontrado para o item.",
    });

    expect(result.success).toBe(true);
  });
});
