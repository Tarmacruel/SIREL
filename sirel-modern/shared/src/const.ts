export const workflowModuleOptions = [
  "PLANEJAMENTO",
  "COMPRAS",
  "LICITACAO",
  "PROCURADORIA",
  "CONTROLADORIA",
  "CONTRATOS",
  "DOCUMENTOS",
] as const;

export const workflowSituacaoOptions = [
  "RASCUNHO",
  "EM_ANDAMENTO",
  "AGUARDANDO",
  "CONCLUIDO",
  "SUSPENSO",
] as const;

export const modoDisputaOptions = [
  "NAO_SE_APLICA",
  "ABERTO",
  "FECHADO",
  "ABERTO_FECHADO",
  "FECHADO_ABERTO",
] as const;

export const grauPrioridadeOptions = [
  "BAIXA",
  "MEDIA",
  "ALTA",
  "URGENTE",
] as const;

export const modoDisputaLabels: Record<(typeof modoDisputaOptions)[number], string> = {
  NAO_SE_APLICA: "N\u00e3o se aplica",
  ABERTO: "Aberto",
  FECHADO: "Fechado",
  ABERTO_FECHADO: "Aberto-fechado",
  FECHADO_ABERTO: "Fechado-aberto",
};

export const grauPrioridadeLabels: Record<(typeof grauPrioridadeOptions)[number], string> = {
  BAIXA: "Baixa",
  MEDIA: "Media",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const modalidadeCatalog = [
  { codigo: "CONCORRENCIA_ELETRONICA", nome: "Concorr\u00eancia Eletr\u00f4nica", siglaEdital: "CE" },
  { codigo: "CONCORRENCIA_PRESENCIAL", nome: "Concorr\u00eancia Presencial", siglaEdital: "CP" },
  { codigo: "CREDENCIAMENTO", nome: "Credenciamento", siglaEdital: "CD" },
  { codigo: "DISPENSA_SIMPLIFICADA", nome: "Dispensa Simplificada", siglaEdital: "DLS" },
  { codigo: "DISPENSA_ELETRONICA", nome: "Dispensa Eletr\u00f4nica", siglaEdital: "DLE" },
  { codigo: "INEXIGIBILIDADE", nome: "Inexigibilidade", siglaEdital: "IL" },
  { codigo: "LEILAO_ELETRONICO", nome: "Leil\u00e3o Eletr\u00f4nico", siglaEdital: "LE" },
  { codigo: "PREGAO_ELETRONICO", nome: "Preg\u00e3o Eletr\u00f4nico", siglaEdital: "PE" },
  { codigo: "PREGAO_PRESENCIAL", nome: "Preg\u00e3o Presencial", siglaEdital: "PP" },
] as const;

export const modalidadeCodes = modalidadeCatalog.map((item) => item.codigo) as [
  (typeof modalidadeCatalog)[number]["codigo"],
  ...(typeof modalidadeCatalog)[number]["codigo"][],
];

export const appModules = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "planejamento", label: "Planejamento", href: "/planejamento" },
  { key: "compras", label: "Compras", href: "/compras" },
  { key: "licitacao", label: "Licitacao", href: "/licitacao" },
  { key: "documentos", label: "Documentos", href: "/documentos" },
  { key: "contratos", label: "Contratos", href: "/contratos" },
  { key: "workflow", label: "Workflow", href: "/workflow" },
  { key: "usuarios", label: "Usuarios", href: "/usuarios" },
] as const;
