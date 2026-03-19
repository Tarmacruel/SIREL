export const systemName = "SIREL";
export const systemFullName = "SIREL - Sistema de Registro e Gestão de Licitações";
export const systemFooterText = `${systemFullName} - Desenvolvido por Jonatas da Silva Sousa`;

export const prefeituraLines = [
  "MUNICIPIO DE TEIXEIRA DE FREITAS",
  "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS",
  "CNPJ: 13.650.403/0001-28",
  "AV MARECHAL CASTELO BRANCO, 145, CENTRO, 45985160, TEIXEIRA DE FREITAS-BA",
] as const;

export function buildPrefeituraLogoSvg() {
  return `
    <svg width="320" height="106" viewBox="0 0 1200 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Prefeitura Municipal de Teixeira de Freitas">
      <rect width="1200" height="420" fill="white"/>
      <text x="600" y="54" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" letter-spacing="12" fill="#4B5563">PREFEITURA DE</text>
      <rect x="230" y="86" width="188" height="14" rx="7" fill="#1B8F36"/>
      <rect x="418" y="86" width="188" height="14" rx="0" fill="#FF0000"/>
      <rect x="606" y="86" width="188" height="14" rx="0" fill="#1B9FD0"/>
      <rect x="794" y="86" width="176" height="14" rx="7" fill="#FFD51F"/>
      <text x="600" y="264" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="700" letter-spacing="2" fill="#2440A7">TEIXEIRA</text>
      <text x="600" y="368" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="74" font-weight="700" letter-spacing="8" fill="#1798D3">DE FREITAS</text>
    </svg>
  `.trim();
}
