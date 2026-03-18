import { describe, expect, it } from "vitest";

import { buildItemPayload, validateContratoItemForm, validateItemForm } from "@/features/itens/form";

describe("itens form", () => {
  it("normaliza o payload do item com unidade em caixa alta", () => {
    const payload = buildItemPayload({
      descricao: "Farinha de trigo",
      unidadePadrao: "pct",
      valorReferencia: "1.250,50",
      ativo: true,
    });

    expect(payload).toEqual({
      descricao: "Farinha de trigo",
      unidadePadrao: "PCT",
      valorReferencia: 1250.5,
      ativo: true,
      itemId: undefined,
    });
  });

  it("bloqueia controle de saldo com consumo maior que contratado", () => {
    const parsed = validateContratoItemForm(
      {
        contratoId: "1",
        descricao: "Farinha de trigo",
        unidade: "pct",
        quantidadeContratada: "10",
        quantidadeConsumida: "12",
        valorUnitario: "5,50",
        ativo: true,
      },
      1,
    );

    expect(parsed.success).toBe(false);
  });

  it("aceita controle de saldo válido", () => {
    const parsed = validateItemForm({
      descricao: "Farinha de trigo",
      unidadePadrao: "pct",
      valorReferencia: "5,50",
      ativo: true,
    });

    expect(parsed.success).toBe(true);
  });
});
