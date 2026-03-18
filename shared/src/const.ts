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

export const metodologiaCotacaoOptions = [
  "MENOR_PRECO",
  "MEDIA",
  "MEDIANA",
] as const;

export const licitacaoStatusOptions = [
  "PREPARACAO",
  "PUBLICACAO",
  "RECEBIMENTO_PROPOSTAS",
  "ABERTURA_PROPOSTAS",
  "LANCES",
  "JULGAMENTO",
  "HABILITACAO",
  "RECURSOS",
  "HOMOLOGACAO",
  "CONTRATACAO",
  "FRACASSADA",
  "CANCELADA",
] as const;

export const habilitacaoStatusOptions = [
  "PENDENTE",
  "HABILITADO",
  "INABILITADO",
] as const;

export const propostaSituacaoOptions = [
  "VALIDA",
  "DESCLASSIFICADA",
  "VENCEDORA",
] as const;

export const recursoResultadoOptions = [
  "PENDENTE",
  "PROVIDO",
  "IMPROVIDO",
  "PARCIALMENTE_PROVIDO",
] as const;

export const prazoProcessualTipoOptions = [
  "PUBLICACAO_EDITAL",
  "RECEBIMENTO_PROPOSTAS",
  "SESSAO_PUBLICA",
  "RESPOSTA_IMPUGNACAO",
  "RESPOSTA_ESCLARECIMENTO",
  "HABILITACAO",
  "ANALISE_TECNICA",
  "CORRECAO",
  "AUTORIZACAO",
  "JULGAMENTO",
  "RECURSOS",
  "HOMOLOGACAO",
  "PUBLICACAO_RESULTADO",
  "ASSINATURA_CONTRATO",
] as const;

export const prazoProcessualStatusOptions = [
  "PENDENTE",
  "EM_ATRASO",
  "CONCLUIDO",
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
  MEDIA: "M\u00e9dia",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const metodologiaCotacaoLabels: Record<(typeof metodologiaCotacaoOptions)[number], string> = {
  MENOR_PRECO: "Menor pre\u00e7o",
  MEDIA: "M\u00e9dia",
  MEDIANA: "Mediana",
};

export const licitacaoStatusLabels: Record<(typeof licitacaoStatusOptions)[number], string> = {
  PREPARACAO: "Preparação do edital",
  PUBLICACAO: "Publicação do edital",
  RECEBIMENTO_PROPOSTAS: "Recebimento de propostas",
  ABERTURA_PROPOSTAS: "Abertura de propostas",
  LANCES: "Fase de lances",
  JULGAMENTO: "Julgamento",
  HABILITACAO: "Habilitação",
  RECURSOS: "Recursos",
  HOMOLOGACAO: "Homologação",
  CONTRATACAO: "Contratação",
  FRACASSADA: "Licitação fracassada",
  CANCELADA: "Licitação cancelada",
};

export const habilitacaoStatusLabels: Record<(typeof habilitacaoStatusOptions)[number], string> = {
  PENDENTE: "Pendente",
  HABILITADO: "Habilitado",
  INABILITADO: "Inabilitado",
};

export const propostaSituacaoLabels: Record<(typeof propostaSituacaoOptions)[number], string> = {
  VALIDA: "Válida",
  DESCLASSIFICADA: "Desclassificada",
  VENCEDORA: "Vencedora",
};

export const recursoResultadoLabels: Record<(typeof recursoResultadoOptions)[number], string> = {
  PENDENTE: "Pendente",
  PROVIDO: "Provido",
  IMPROVIDO: "Improvido",
  PARCIALMENTE_PROVIDO: "Parcialmente provido",
};

export const prazoProcessualTipoLabels: Record<(typeof prazoProcessualTipoOptions)[number], string> = {
  PUBLICACAO_EDITAL: "Publicação do edital",
  RECEBIMENTO_PROPOSTAS: "Recebimento de propostas",
  SESSAO_PUBLICA: "Sessão pública",
  RESPOSTA_IMPUGNACAO: "Resposta à impugnação",
  RESPOSTA_ESCLARECIMENTO: "Resposta ao esclarecimento",
  HABILITACAO: "Habilitação",
  ANALISE_TECNICA: "Análise técnica",
  CORRECAO: "Correção",
  AUTORIZACAO: "Autorização",
  JULGAMENTO: "Julgamento",
  RECURSOS: "Recursos",
  HOMOLOGACAO: "Homologação",
  PUBLICACAO_RESULTADO: "Publicação do resultado",
  ASSINATURA_CONTRATO: "Assinatura do contrato",
};

export const prazoProcessualStatusLabels: Record<(typeof prazoProcessualStatusOptions)[number], string> = {
  PENDENTE: "Pendente",
  EM_ATRASO: "Em atraso",
  CONCLUIDO: "Concluído",
};

export const licitacaoStepCatalog = [
  {
    key: "PUBLICACAO",
    label: "Publicação",
    description: "Edital, aviso e cronograma oficial da licitação.",
  },
  {
    key: "RECEBIMENTO_PROPOSTAS",
    label: "Propostas",
    description: "Cadastro dos licitantes e recebimento das propostas.",
  },
  {
    key: "LANCES",
    label: "Lances",
    description: "Fase competitiva aplicável às modalidades que admitem lances.",
  },
  {
    key: "JULGAMENTO",
    label: "Julgamento",
    description: "Análise, classificação e definição das propostas vencedoras.",
  },
  {
    key: "HABILITACAO",
    label: "Habilitação",
    description: "Verificação documental do licitante classificado.",
  },
  {
    key: "RECURSOS",
    label: "Recursos",
    description: "Interposição, análise e decisão recursal.",
  },
  {
    key: "HOMOLOGACAO",
    label: "Homologação",
    description: "Encerramento da fase licitatória e aprovação do resultado.",
  },
] as const;

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
  { key: "consultas", label: "Consultas", href: "/consultas" },
  { key: "prazos", label: "Prazos", href: "/prazos" },
  { key: "itens", label: "Itens", href: "/itens" },
  { key: "planejamento", label: "Planejamento", href: "/planejamento" },
  { key: "compras", label: "Compras", href: "/compras" },
  { key: "licitacao", label: "Licita\u00e7\u00e3o", href: "/licitacao" },
  { key: "documentos", label: "Documentos", href: "/documentos" },
  { key: "contratos", label: "Contratos", href: "/contratos" },
  { key: "workflow", label: "Workflow", href: "/workflow" },
  { key: "usuarios", label: "Usu\u00e1rios", href: "/usuarios" },
] as const;
