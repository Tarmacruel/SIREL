export const PNCP_CONFIG = {
  API_BASE: "https://pncp.gov.br/api/consulta",
  API_BASE_PNCP: "https://pncp.gov.br/api/pncp",
  TEIXEIRA_FREITAS: {
    cnpj: "13650403000128",
    cnpjFormatado: "13.650.403/0001-28",
    nome: "MUNICIPIO DE TEIXEIRA DE FREITAS",
    uf: "BA",
  },
  MODALIDADE_CODIGOS: (() => {
    const fromEnv = (process.env.PNCP_MODALIDADE_CODIGOS ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (fromEnv.length) return fromEnv;
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  })(),
  RATE_LIMIT: {
    requestsPerMinute: 30,
    delayBetweenPagesMs: 300,
  },
} as const;
