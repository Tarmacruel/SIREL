export const PNCP_CONFIG = {
  API_BASE: "https://pncp.gov.br/api",
  TEIXEIRA_FREITAS: {
    cnpj: "13650403000128",
    cnpjFormatado: "13.650.403/0001-28",
    nome: "MUNICIPIO DE TEIXEIRA DE FREITAS",
    uf: "BA",
  },
  RATE_LIMIT: {
    requestsPerMinute: 30,
    delayBetweenPagesMs: 300,
  },
} as const;
