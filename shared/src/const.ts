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

export const licitacaoInternalDocumentCategories = [
  "LICITACAO_DECRETO_COMISSAO",
  "LICITACAO_DECRETO_EQUIPE_APOIO",
  "LICITACAO_COMUNICACAO_RESERVA_ORCAMENTARIA",
  "LICITACAO_RESERVA_ORCAMENTARIA",
  "LICITACAO_DECRETO_ORDENADOR_DESPESAS",
  "LICITACAO_ATO_AUTORIZACAO_AUTORIDADE",
  "LICITACAO_DECLARACAO_NAO_FRACIONAMENTO",
  "LICITACAO_MINUTA_AVISO",
  "LICITACAO_COMUNICACAO_PARECER_JURIDICO",
  "LICITACAO_PARECER_JURIDICO",
  "LICITACAO_AVISO",
  "LICITACAO_TERMO_AUTUACAO",
  "LICITACAO_DECRETO_AGENTE_CONTRATACAO",
] as const;

export const licitacaoPublicationChannels = [
  "PORTAL",
  "PNCP",
  "DOU",
  "JORNAL",
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
    key: "PREPARACAO_INTERNA",
    label: "Preparação interna",
    description: "Checklist documental interno obrigatório antes da publicidade.",
  },
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

export const licitacaoInternalDocumentChecklist = [
  {
    category: "LICITACAO_DECRETO_COMISSAO",
    label: "Decreto da comissão",
    description: "Documento de designação da comissão aplicável à fase licitatória.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_DECRETO_EQUIPE_APOIO",
    label: "Decreto da equipe de apoio",
    description: "Ato da equipe de apoio vinculada ao processo.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_COMUNICACAO_RESERVA_ORCAMENTARIA",
    label: "Comunicação interna para solicitar reserva orçamentária",
    description: "Comunicação formal para abertura da reserva orçamentária.",
    tipo: "COMUNICACAO_INTERNA",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_RESERVA_ORCAMENTARIA",
    label: "Reserva orçamentária",
    description: "Comprovante da reserva orçamentária do processo.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_DECRETO_ORDENADOR_DESPESAS",
    label: "Decreto do Ordenador de Despesas",
    description: "Ato do Ordenador de Despesas aplicável ao processo.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_ATO_AUTORIZACAO_AUTORIDADE",
    label: "Ato de autorização da autoridade competente",
    description: "Autorização formal da autoridade competente para o prosseguimento.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_DECLARACAO_NAO_FRACIONAMENTO",
    label: "Declaração de não fracionamento de despesa",
    description: "Obrigatória apenas quando a dispensa exigir essa declaração.",
    tipo: "OUTRO",
    obrigatorio: false,
    condicional: "DECLARACAO_NAO_FRACIONAMENTO",
  },
  {
    category: "LICITACAO_MINUTA_AVISO",
    label: "Minuta do aviso de licitação",
    description: "Minuta interna do aviso antes da publicação oficial.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_COMUNICACAO_PARECER_JURIDICO",
    label: "Comunicação para solicitar parecer jurídico",
    description: "Solicitação formal de manifestação jurídica.",
    tipo: "COMUNICACAO_INTERNA",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_PARECER_JURIDICO",
    label: "Parecer jurídico",
    description: "Parecer jurídico emitido para a fase interna.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_AVISO",
    label: "Aviso de licitação",
    description: "Versão final do aviso preparada para publicação.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_TERMO_AUTUACAO",
    label: "Termo de autuação pelo agente de contratação/pregoeiro",
    description: "Registro formal de autuação da fase licitatória.",
    tipo: "OUTRO",
    obrigatorio: true,
  },
  {
    category: "LICITACAO_DECRETO_AGENTE_CONTRATACAO",
    label: "Decreto do Agente de Contratação",
    description: "Ato de designação do agente de contratação/pregoeiro.",
    tipo: "OUTRO",
    obrigatorio: true,
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

export const licitacaoPrazoBasePorModalidade: Record<(typeof modalidadeCatalog)[number]["codigo"], number> = {
  CONCORRENCIA_ELETRONICA: 10,
  CONCORRENCIA_PRESENCIAL: 10,
  CREDENCIAMENTO: 15,
  DISPENSA_SIMPLIFICADA: 3,
  DISPENSA_ELETRONICA: 3,
  INEXIGIBILIDADE: 3,
  LEILAO_ELETRONICO: 15,
  PREGAO_ELETRONICO: 8,
  PREGAO_PRESENCIAL: 8,
};

export const appModules = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "notificacoes", label: "Notificações", href: "/notificacoes" },
  { key: "consultas", label: "Consultas", href: "/consultas" },
  { key: "relatorios", label: "Relatórios", href: "/relatorios" },
  { key: "prazos", label: "Prazos", href: "/prazos" },
  { key: "importacoes", label: "Importações", href: "/importacoes" },
  { key: "cadastros", label: "Cadastros", href: "/cadastros" },
  { key: "processos", label: "Processos", href: "/processos" },
  { key: "itens", label: "Itens", href: "/itens" },
  { key: "planejamento", label: "Planejamento", href: "/planejamento" },
  { key: "compras", label: "Compras", href: "/compras" },
  { key: "licitacao", label: "Licita\u00e7\u00e3o", href: "/licitacao" },
  { key: "documentos", label: "Documentos", href: "/documentos" },
  { key: "contratos", label: "Contratos", href: "/contratos" },
  { key: "workflow", label: "Workflow", href: "/workflow" },
  { key: "auditoria", label: "Auditoria", href: "/auditoria" },
  { key: "parametros", label: "Parâmetros", href: "/parametros" },
  { key: "usuarios", label: "Usu\u00e1rios", href: "/usuarios" },
] as const;

export const relatorioTipoOptions = [
  "PROCESSOS_POR_STATUS",
  "PRAZOS_CRITICOS",
  "VALORES_POR_SECRETARIA",
  "DOCUMENTOS_POR_TIPO",
  "ATIVIDADE_USUARIOS",
] as const;

export const relatorioTipoLabels: Record<(typeof relatorioTipoOptions)[number], string> = {
  PROCESSOS_POR_STATUS: "Processos por status",
  PRAZOS_CRITICOS: "Prazos críticos",
  VALORES_POR_SECRETARIA: "Valores por secretaria",
  DOCUMENTOS_POR_TIPO: "Documentos por tipo",
  ATIVIDADE_USUARIOS: "Atividade dos usuários",
};

export const importacaoBllSourceLabels = {
  LICITACAO: "Licitações BLL",
  COMPRA_DIRETA: "Compras diretas BLL",
} as const;

export const importacaoBllModeLabels = {
  REMOTA_JSON: "Sincronização remota",
  CSV_MANUAL: "Importação por CSV",
} as const;

export const importacaoBllExecutionStatusLabels = {
  PROCESSANDO: "Processando",
  CONCLUIDA: "Concluída",
  ERRO: "Erro",
} as const;

export const importacaoBllConciliacaoStatusLabels = {
  PENDENTE: "Pendente",
  SUGERIDO: "Sugestão encontrada",
  VINCULADO: "Vinculado",
  IGNORADO: "Ignorado",
} as const;
