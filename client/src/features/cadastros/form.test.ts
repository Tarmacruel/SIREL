import { describe, expect, it } from "vitest";

import { buildCadastroPayload, maskCnpj, maskPhone, validateCadastroForm } from "@/features/cadastros/form";

describe("cadastros form", () => {
  it("aplica máscara de CNPJ", () => {
    expect(maskCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("aplica máscara de telefone com celular", () => {
    expect(maskPhone("73999887766")).toBe("(73) 99988-7766");
  });

  it("normaliza payload de fornecedor para validação", () => {
    const payload = buildCadastroPayload("fornecedores", {
      razaoSocial: "Fornecedor Teste",
      cnpj: "12.345.678/0001-99",
      email: "fornecedor@sirel.local",
      telefone: "73999887766",
      cidade: "Teixeira de Freitas",
      estado: "ba",
      ativo: true,
    });

    expect(payload).toEqual({
      id: undefined,
      razaoSocial: "Fornecedor Teste",
      cnpj: "12345678000199",
      email: "fornecedor@sirel.local",
      telefone: "(73) 99988-7766",
      cidade: "Teixeira de Freitas",
      estado: "BA",
      ativo: true,
    });
  });

  it("exige secretaria para usuário gestor", () => {
    const result = validateCadastroForm("usuarios", {
      username: "gestor.teste",
      name: "Gestor Teste",
      email: "gestor@sirel.local",
      role: "gestor",
      secretariaId: "",
      password: "Senha123",
      ativo: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.secretariaId).toBeTruthy();
    }
  });
});
