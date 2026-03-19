import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "user",
  "admin",
  "gestor",
  "operador",
  "auditor",
]);
export const escopoDisputaEnum = pgEnum("escopo_disputa", [
  "ITEM",
  "LOTE",
  "GLOBAL",
]);
export const tipoObjetoEnum = pgEnum("tipo_objeto", [
  "PRODUTO",
  "SERVICO",
  "OBRA",
  "SERVICO_ENG",
]);
export const tipoContratacaoEnum = pgEnum("tipo_contratacao", [
  "AQUISICAO",
  "REGISTRO_PRECO",
  "AQUISICAO_PARCELADA",
]);
export const documentoTipoEnum = pgEnum("documento_tipo", [
  "DFD",
  "ETP",
  "TR",
  "EDITAL",
  "COMUNICACAO_INTERNA",
  "RESULTADO",
  "CONTRATO",
  "OUTRO",
]);
export const workflowModuloEnum = pgEnum("workflow_modulo", [
  "PLANEJAMENTO",
  "COMPRAS",
  "LICITACAO",
  "PROCURADORIA",
  "CONTROLADORIA",
  "CONTRATOS",
  "DOCUMENTOS",
]);
export const workflowSituacaoEnum = pgEnum("workflow_situacao", [
  "RASCUNHO",
  "EM_ANDAMENTO",
  "AGUARDANDO",
  "CONCLUIDO",
  "SUSPENSO",
]);
export const contratoStatusEnum = pgEnum("contrato_status", [
  "ATIVO",
  "ENCERRADO",
  "SUSPENSO",
  "RESCINDIDO",
]);
export const alertaTipoEnum = pgEnum("alerta_tipo", [
  "VENCIMENTO",
  "PRAZO",
  "APROVACAO",
  "DOCUMENTACAO",
]);
export const auditoriaAcaoEnum = pgEnum("auditoria_acao", [
  "CREATE",
  "UPDATE",
  "DELETE",
]);
export const notificacaoTipoEnum = pgEnum("notificacao_tipo", [
  "PRAZO",
  "MOVIMENTACAO",
  "DOCUMENTO",
  "SISTEMA",
]);
export const notificacaoPrioridadeEnum = pgEnum("notificacao_prioridade", [
  "BAIXA",
  "MEDIA",
  "ALTA",
  "URGENTE",
]);
export const authEventTypeEnum = pgEnum("auth_event_type", [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGIN_BLOCKED",
  "PASSWORD_CHANGE",
  "PASSWORD_RESET",
]);
export const prazoProcessualTipoEnum = pgEnum("prazo_processual_tipo", [
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
]);
export const prazoProcessualStatusEnum = pgEnum("prazo_processual_status", [
  "PENDENTE",
  "EM_ATRASO",
  "CONCLUIDO",
]);
export const cotacaoStatusEnum = pgEnum("cotacao_status", [
  "ATIVA",
  "VENCIDA",
  "CANCELADA",
]);
export const prioridadeDfdEnum = pgEnum("prioridade_dfd", [
  "BAIXA",
  "MEDIA",
  "ALTA",
  "URGENTE",
]);
export const licitacaoStatusEnum = pgEnum("licitacao_status", [
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
]);
export const habilitacaoStatusEnum = pgEnum("habilitacao_status", [
  "PENDENTE",
  "HABILITADO",
  "INABILITADO",
]);
export const propostaSituacaoEnum = pgEnum("proposta_situacao", [
  "VALIDA",
  "DESCLASSIFICADA",
  "VENCEDORA",
]);
export const recursoResultadoEnum = pgEnum("recurso_resultado", [
  "PENDENTE",
  "PROVIDO",
  "IMPROVIDO",
  "PARCIALMENTE_PROVIDO",
]);
export const importacaoBllOrigemEnum = pgEnum("importacao_bll_origem", [
  "LICITACAO",
  "COMPRA_DIRETA",
]);
export const importacaoBllModoEnum = pgEnum("importacao_bll_modo", [
  "REMOTA_JSON",
  "CSV_MANUAL",
]);
export const importacaoBllStatusExecucaoEnum = pgEnum(
  "importacao_bll_status_execucao",
  ["PROCESSANDO", "CONCLUIDA", "ERRO"],
);
export const importacaoBllConciliacaoStatusEnum = pgEnum(
  "importacao_bll_conciliacao_status",
  ["PENDENTE", "SUGERIDO", "VINCULADO", "IGNORADO"],
);

export const secretarias = pgTable("secretarias", {
  id: serial("id").primaryKey(),
  sigla: varchar("sigla", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  responsavel: varchar("responsavel", { length: 255 }),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 32 }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const parametrosSistema = pgTable(
  "parametros_sistema",
  {
    id: serial("id").primaryKey(),
    categoria: varchar("categoria", { length: 120 }).notNull(),
    chave: varchar("chave", { length: 120 }).notNull(),
    valor: text("valor").notNull(),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqChave: uniqueIndex("parametros_sistema_chave_uq").on(table.chave),
    idxCategoria: index("parametros_sistema_categoria_idx").on(table.categoria),
    idxAtivo: index("parametros_sistema_ativo_idx").on(table.ativo),
  }),
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("open_id", { length: 255 }).unique(),
    username: varchar("username", { length: 80 }).unique(),
    name: text("name").notNull(),
    email: varchar("email", { length: 255 }),
    loginMethod: varchar("login_method", { length: 64 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    role: userRoleEnum("role").notNull().default("user"),
    secretariaId: integer("secretaria_id").references(() => secretarias.id),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSignedIn: timestamp("last_signed_in", { withTimezone: true }),
  },
  (table) => ({
    idxSecretaria: index("users_secretaria_idx").on(table.secretariaId),
  }),
);

export const pessoas = pgTable(
  "pessoas",
  {
    id: serial("id").primaryKey(),
    nome: varchar("nome", { length: 200 }).notNull(),
    cpf: varchar("cpf", { length: 18 }),
    cargo: varchar("cargo", { length: 120 }),
    secretariaId: integer("secretaria_id").references(() => secretarias.id),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxSecretaria: index("pessoas_secretaria_idx").on(table.secretariaId),
  }),
);

export const departamentos = pgTable(
  "departamentos",
  {
    id: serial("id").primaryKey(),
    nome: varchar("nome", { length: 255 }).notNull(),
    codigoCentroCusto: varchar("codigo_centro_custo", { length: 64 }),
    secretariaId: integer("secretaria_id")
      .notNull()
      .references(() => secretarias.id),
    responsavelId: integer("responsavel_id").references(() => pessoas.id),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxSecretaria: index("departamentos_secretaria_idx").on(table.secretariaId),
    idxAtivo: index("departamentos_ativo_idx").on(table.ativo),
  }),
);

export const modalidades = pgTable("modalidades", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  ativo: boolean("ativo").notNull().default(true),
});

export const statusProcesso = pgTable("status_processo", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cor: varchar("cor", { length: 16 }),
  ativo: boolean("ativo").notNull().default(true),
});

export const processos = pgTable(
  "processos",
  {
    id: serial("id").primaryKey(),
    numeroSirel: varchar("numero_sirel", { length: 64 }).notNull().unique(),
    numeroAdministrativo: varchar("numero_administrativo", { length: 64 }),
    numeroEdital: varchar("numero_edital", { length: 64 }),
    anoReferencia: integer("ano_referencia").notNull(),
    foraDoFluxo: boolean("fora_do_fluxo").notNull().default(false),
    secretariaId: integer("secretaria_id")
      .notNull()
      .references(() => secretarias.id),
    modalidadeId: integer("modalidade_id").references(() => modalidades.id),
    statusId: integer("status_id").references(() => statusProcesso.id),
    objeto: text("objeto").notNull(),
    valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }),
    valorHomologado: numeric("valor_homologado", { precision: 14, scale: 2 }),
    escopoDisputa: escopoDisputaEnum("escopo_disputa")
      .notNull()
      .default("GLOBAL"),
    criterioJulgamento: varchar("criterio_julgamento", { length: 120 }),
    modoDisputa: varchar("modo_disputa", { length: 120 }),
    tipoObjeto: tipoObjetoEnum("tipo_objeto").notNull().default("PRODUTO"),
    tipoContratacao: tipoContratacaoEnum("tipo_contratacao")
      .notNull()
      .default("AQUISICAO"),
    autoridadeCompetenteId: integer("autoridade_competente_id").references(
      () => pessoas.id,
    ),
    condutorProcessoId: integer("condutor_processo_id").references(
      () => pessoas.id,
    ),
    dataAbertura: date("data_abertura"),
    dataEncerramento: date("data_encerramento"),
    ativo: boolean("ativo").notNull().default(true),
    publicado: boolean("publicado").notNull().default(false),
    homologado: boolean("homologado").notNull().default(false),
    finalizado: boolean("finalizado").notNull().default(false),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxNumero: index("processos_numero_idx").on(table.numeroSirel),
    idxSecretaria: index("processos_secretaria_idx").on(table.secretariaId),
    idxStatus: index("processos_status_idx").on(table.statusId),
    idxAtivo: index("processos_ativo_idx").on(table.ativo),
  }),
);

export const workflowProcesso = pgTable("workflow_processo", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  moduloAtual: workflowModuloEnum("modulo_atual")
    .notNull()
    .default("PLANEJAMENTO"),
  situacao: workflowSituacaoEnum("situacao").notNull().default("RASCUNHO"),
  etapaAtual: varchar("etapa_atual", { length: 255 })
    .notNull()
    .default("Cadastro inicial"),
  dataInicio: date("data_inicio"),
  dataConclusao: date("data_conclusao"),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dfd = pgTable("dfd", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  setorDemandante: varchar("setor_demandante", { length: 255 }).notNull(),
  secretariaDemandanteId: integer("secretaria_demandante_id").references(
    () => secretarias.id,
  ),
  grauPrioridade: prioridadeDfdEnum("grau_prioridade")
    .notNull()
    .default("MEDIA"),
  demandaSistemica: boolean("demanda_sistemica").notNull().default(false),
  justificativa: text("justificativa").notNull(),
  dataNecessidade: date("data_necessidade"),
  dataPrevistaConclusao: date("data_prevista_conclusao"),
  observacoes: text("observacoes"),
  secretariaResponsavelId: integer("secretaria_responsavel_id").references(
    () => secretarias.id,
  ),
  solicitantePessoaId: integer("solicitante_pessoa_id").references(
    () => pessoas.id,
  ),
  solicitanteUserId: integer("solicitante_user_id").references(() => users.id),
  assinaturaResponsavelId: integer("assinatura_responsavel_id").references(
    () => pessoas.id,
  ),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dfdResponsaveis = pgTable(
  "dfd_responsaveis",
  {
    id: serial("id").primaryKey(),
    dfdId: integer("dfd_id")
      .notNull()
      .references(() => dfd.id, { onDelete: "cascade" }),
    pessoaId: integer("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqDfdPessoa: uniqueIndex("dfd_responsaveis_dfd_pessoa_uq").on(
      table.dfdId,
      table.pessoaId,
    ),
  }),
);

export const dfdSecretariasParticipantes = pgTable(
  "dfd_secretarias_participantes",
  {
    id: serial("id").primaryKey(),
    dfdId: integer("dfd_id")
      .notNull()
      .references(() => dfd.id, { onDelete: "cascade" }),
    secretariaId: integer("secretaria_id")
      .notNull()
      .references(() => secretarias.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqDfdSecretaria: uniqueIndex(
      "dfd_secretarias_participantes_dfd_secretaria_uq",
    ).on(table.dfdId, table.secretariaId),
  }),
);

export const etp = pgTable("etp", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  metodologiaCotacao: varchar("metodologia_cotacao", { length: 32 })
    .notNull()
    .default("MEDIA"),
  descricaoNecessidade: text("descricao_necessidade"),
  analiseSolucoesMercado: text("analise_solucoes_mercado"),
  justificativaTecnica: text("justificativa_tecnica"),
  providenciasPrevias: text("providencias_previas"),
  conclusaoViabilidade: text("conclusao_viabilidade"),
  observacoes: text("observacoes"),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tr = pgTable("tr", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  objetoTermo: text("objeto_termo").notNull(),
  fundamentacaoContratacao: text("fundamentacao_contratacao").notNull(),
  descricaoSolucao: text("descricao_solucao").notNull(),
  requisitosContratacao: text("requisitos_contratacao").notNull(),
  modeloExecucao: text("modelo_execucao"),
  criteriosMedicaoPagamento: text("criterios_medicao_pagamento"),
  adequacaoOrcamentaria: text("adequacao_orcamentaria"),
  orcamentoSigiloso: boolean("orcamento_sigiloso").notNull().default(false),
  observacoes: text("observacoes"),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const catalogoItens = pgTable(
  "catalogo_itens",
  {
    id: serial("id").primaryKey(),
    descricao: text("descricao").notNull(),
    unidadePadrao: varchar("unidade_padrao", { length: 32 }).notNull(),
    valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
    imagemUrl: varchar("imagem_url", { length: 255 }),
    imagemChave: varchar("imagem_chave", { length: 255 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxDescricao: index("catalogo_itens_descricao_idx").on(table.descricao),
  }),
);

export const movimentacoesWorkflow = pgTable(
  "movimentacoes_workflow",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    moduloOrigem: varchar("modulo_origem", { length: 64 }),
    moduloDestino: varchar("modulo_destino", { length: 64 }).notNull(),
    descricao: varchar("descricao", { length: 255 }).notNull(),
    observacao: text("observacao"),
    usuarioId: integer("usuario_id").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("movimentacoes_processo_idx").on(table.processoId),
  }),
);

export const lotes = pgTable(
  "lotes",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    numeroLote: integer("numero_lote").notNull(),
    descricao: text("descricao").notNull(),
    valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }),
    valorHomologado: numeric("valor_homologado", { precision: 14, scale: 2 }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqProcessoLote: uniqueIndex("lotes_processo_numero_uq").on(
      table.processoId,
      table.numeroLote,
    ),
  }),
);

export const itensProcesso = pgTable(
  "itens_processo",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    loteId: integer("lote_id").references(() => lotes.id, {
      onDelete: "set null",
    }),
    catalogoItemId: integer("catalogo_item_id").references(
      () => catalogoItens.id,
      { onDelete: "set null" },
    ),
    numeroItem: integer("numero_item").notNull(),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    unidade: varchar("unidade", { length: 32 }).notNull(),
    valorUnitarioEstimado: numeric("valor_unitario_estimado", {
      precision: 14,
      scale: 2,
    }),
    valorTotalEstimado: numeric("valor_total_estimado", {
      precision: 14,
      scale: 2,
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("itens_processo_idx").on(table.processoId),
    idxCatalogoItem: index("itens_processo_catalogo_item_idx").on(
      table.catalogoItemId,
    ),
  }),
);

export const etpCotacoesPreliminares = pgTable(
  "etp_cotacoes_preliminares",
  {
    id: serial("id").primaryKey(),
    etpId: integer("etp_id")
      .notNull()
      .references(() => etp.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => itensProcesso.id, { onDelete: "cascade" }),
    fonte: varchar("fonte", { length: 255 }).notNull(),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }).notNull(),
    documento: varchar("documento", { length: 80 }),
    dataCotacao: date("data_cotacao"),
    quantidadeConsiderada: numeric("quantidade_considerada", {
      precision: 14,
      scale: 3,
    }).notNull(),
    valorUnitario: numeric("valor_unitario", {
      precision: 14,
      scale: 2,
    }).notNull(),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }).notNull(),
    considerada: boolean("considerada").notNull().default(true),
    motivoDesconsideracao: varchar("motivo_desconsideracao", { length: 32 }),
    justificativaDesconsideracao: text("justificativa_desconsideracao"),
    observacao: text("observacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxEtp: index("etp_cotacoes_preliminares_etp_idx").on(table.etpId),
    idxItem: index("etp_cotacoes_preliminares_item_idx").on(table.itemId),
  }),
);

export const fornecedores = pgTable(
  "fornecedores",
  {
    id: serial("id").primaryKey(),
    razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
    cnpj: varchar("cnpj", { length: 20 }).notNull().unique(),
    email: varchar("email", { length: 255 }),
    telefone: varchar("telefone", { length: 32 }),
    cidade: varchar("cidade", { length: 128 }),
    estado: varchar("estado", { length: 2 }),
    logoUrl: varchar("logo_url", { length: 255 }),
    logoChave: varchar("logo_chave", { length: 255 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxCnpj: index("fornecedores_cnpj_idx").on(table.cnpj),
  }),
);

export const cotacoes = pgTable("cotacoes", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .references(() => processos.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => itensProcesso.id, {
    onDelete: "cascade",
  }),
  fornecedorId: integer("fornecedor_id")
    .notNull()
    .references(() => fornecedores.id),
  valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
  valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
  dataCotacao: date("data_cotacao"),
  status: cotacaoStatusEnum("status").notNull().default("ATIVA"),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const licitacoes = pgTable(
  "licitacoes",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .unique()
      .references(() => processos.id, { onDelete: "cascade" }),
    statusLicitacao: licitacaoStatusEnum("status_licitacao")
      .notNull()
      .default("PREPARACAO"),
    exigeDeclaracaoNaoFracionamento: boolean(
      "exige_declaracao_nao_fracionamento",
    )
      .notNull()
      .default(false),
    publicarNoDou: boolean("publicar_no_dou").notNull().default(false),
    publicarEmJornal: boolean("publicar_em_jornal").notNull().default(false),
    dataPublicacaoEdital: timestamp("data_publicacao_edital", {
      withTimezone: true,
    }),
    dataRecebimentoPropostasInicio: timestamp(
      "data_recebimento_propostas_inicio",
      { withTimezone: true },
    ),
    dataRecebimentoPropostasFim: timestamp("data_recebimento_propostas_fim", {
      withTimezone: true,
    }),
    dataAberturaPropostas: timestamp("data_abertura_propostas", {
      withTimezone: true,
    }),
    dataInicioLances: timestamp("data_inicio_lances", { withTimezone: true }),
    dataFimLances: timestamp("data_fim_lances", { withTimezone: true }),
    dataJulgamento: timestamp("data_julgamento", { withTimezone: true }),
    dataHomologacao: timestamp("data_homologacao", { withTimezone: true }),
    observacoes: text("observacoes"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxStatus: index("licitacoes_status_idx").on(table.statusLicitacao),
  }),
);

export const licitantes = pgTable(
  "licitantes",
  {
    id: serial("id").primaryKey(),
    licitacaoId: integer("licitacao_id")
      .notNull()
      .references(() => licitacoes.id, { onDelete: "cascade" }),
    fornecedorId: integer("fornecedor_id")
      .notNull()
      .references(() => fornecedores.id, { onDelete: "cascade" }),
    dataCadastro: timestamp("data_cadastro", { withTimezone: true })
      .notNull()
      .defaultNow(),
    statusHabilitacao: habilitacaoStatusEnum("status_habilitacao")
      .notNull()
      .default("PENDENTE"),
    observacaoHabilitacao: text("observacao_habilitacao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLicitacao: index("licitantes_licitacao_idx").on(table.licitacaoId),
    idxFornecedor: index("licitantes_fornecedor_idx").on(table.fornecedorId),
    uqLicitante: uniqueIndex("licitantes_licitacao_fornecedor_uq").on(
      table.licitacaoId,
      table.fornecedorId,
    ),
  }),
);

export const propostasLicitacao = pgTable(
  "propostas_licitacao",
  {
    id: serial("id").primaryKey(),
    licitanteId: integer("licitante_id")
      .notNull()
      .references(() => licitantes.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => itensProcesso.id, { onDelete: "cascade" }),
    valorUnitarioProposto: numeric("valor_unitario_proposto", {
      precision: 14,
      scale: 2,
    }).notNull(),
    valorTotalProposto: numeric("valor_total_proposto", {
      precision: 14,
      scale: 2,
    }).notNull(),
    dataProposta: timestamp("data_proposta", { withTimezone: true })
      .notNull()
      .defaultNow(),
    classificacao: integer("classificacao"),
    situacao: propostaSituacaoEnum("situacao").notNull().default("VALIDA"),
    justificativa: text("justificativa"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLicitante: index("propostas_licitacao_licitante_idx").on(
      table.licitanteId,
    ),
    idxItem: index("propostas_licitacao_item_idx").on(table.itemId),
    uqPropostaPorItem: uniqueIndex("propostas_licitacao_licitante_item_uq").on(
      table.licitanteId,
      table.itemId,
    ),
  }),
);

export const lancesLicitacao = pgTable(
  "lances_licitacao",
  {
    id: serial("id").primaryKey(),
    propostaId: integer("proposta_id")
      .notNull()
      .references(() => propostasLicitacao.id, { onDelete: "cascade" }),
    valorLance: numeric("valor_lance", { precision: 14, scale: 2 }).notNull(),
    dataLance: timestamp("data_lance", { withTimezone: true })
      .notNull()
      .defaultNow(),
    usuarioId: integer("usuario_id").references(() => users.id),
    observacao: text("observacao"),
  },
  (table) => ({
    idxProposta: index("lances_licitacao_proposta_idx").on(table.propostaId),
    idxUsuario: index("lances_licitacao_usuario_idx").on(table.usuarioId),
  }),
);

export const recursosLicitacao = pgTable(
  "recursos_licitacao",
  {
    id: serial("id").primaryKey(),
    licitacaoId: integer("licitacao_id")
      .notNull()
      .references(() => licitacoes.id, { onDelete: "cascade" }),
    licitanteId: integer("licitante_id")
      .notNull()
      .references(() => licitantes.id, { onDelete: "cascade" }),
    dataInterposicao: date("data_interposicao").notNull(),
    dataJulgamento: date("data_julgamento"),
    resultado: recursoResultadoEnum("resultado").notNull().default("PENDENTE"),
    descricao: text("descricao").notNull(),
    decisao: text("decisao"),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLicitacao: index("recursos_licitacao_licitacao_idx").on(
      table.licitacaoId,
    ),
    idxLicitante: index("recursos_licitacao_licitante_idx").on(
      table.licitanteId,
    ),
  }),
);

export const documentos = pgTable(
  "documentos",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    descricao: text("descricao"),
    tipo: documentoTipoEnum("tipo").notNull().default("OUTRO"),
    categoria: varchar("categoria", { length: 120 }),
    versao: integer("versao").notNull().default(1),
    arquivoUrl: varchar("arquivo_url", { length: 500 }),
    arquivoChave: varchar("arquivo_chave", { length: 255 }),
    tamanhoBytes: integer("tamanho_bytes"),
    mimeType: varchar("mime_type", { length: 120 }),
    dataReferencia: date("data_referencia"),
    palavrasChave: jsonb("palavras_chave").$type<string[]>(),
    publico: boolean("publico").notNull().default(false),
    restritoA: jsonb("restrito_a").$type<string[]>(),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("documentos_processo_idx").on(table.processoId),
    idxTipo: index("documentos_tipo_idx").on(table.tipo),
    idxDataReferencia: index("documentos_data_referencia_idx").on(
      table.dataReferencia,
    ),
  }),
);

export const prazosProcessuais = pgTable(
  "prazos_processuais",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    tipo: prazoProcessualTipoEnum("tipo").notNull(),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    dataPrevista: date("data_prevista").notNull(),
    dataRealizada: date("data_realizada"),
    status: prazoProcessualStatusEnum("status").notNull().default("PENDENTE"),
    alertasConfig: jsonb("alertas_config")
      .$type<{ lembretes: number[]; canais: string[] }>()
      .notNull()
      .default({ lembretes: [7, 3, 1], canais: ["sistema"] }),
    observacao: text("observacao"),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("prazos_processuais_processo_idx").on(table.processoId),
    idxStatus: index("prazos_processuais_status_idx").on(table.status),
    idxTipo: index("prazos_processuais_tipo_idx").on(table.tipo),
    idxDataPrevista: index("prazos_processuais_data_prevista_idx").on(
      table.dataPrevista,
    ),
  }),
);

export const contratos = pgTable(
  "contratos",
  {
    id: serial("id").primaryKey(),
    numeroContrato: varchar("numero_contrato", { length: 64 })
      .notNull()
      .unique(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id),
    fornecedorId: integer("fornecedor_id")
      .notNull()
      .references(() => fornecedores.id),
    valorContrato: numeric("valor_contrato", { precision: 14, scale: 2 }),
    dataAssinatura: date("data_assinatura"),
    dataVigenciaInicio: date("data_vigencia_inicio"),
    dataVigenciaFim: date("data_vigencia_fim"),
    objeto: text("objeto").notNull(),
    status: contratoStatusEnum("status").notNull().default("ATIVO"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("contratos_processo_idx").on(table.processoId),
    idxStatus: index("contratos_status_idx").on(table.status),
  }),
);

export const contratoItens = pgTable(
  "contrato_itens",
  {
    id: serial("id").primaryKey(),
    contratoId: integer("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    catalogoItemId: integer("catalogo_item_id")
      .notNull()
      .references(() => catalogoItens.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    unidade: varchar("unidade", { length: 32 }).notNull(),
    quantidadeContratada: numeric("quantidade_contratada", {
      precision: 14,
      scale: 3,
    }).notNull(),
    quantidadeConsumida: numeric("quantidade_consumida", {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default("0"),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxContrato: index("contrato_itens_contrato_idx").on(table.contratoId),
    idxCatalogoItem: index("contrato_itens_catalogo_item_idx").on(
      table.catalogoItemId,
    ),
    uqContratoItem: uniqueIndex("contrato_itens_contrato_catalogo_uq").on(
      table.contratoId,
      table.catalogoItemId,
    ),
  }),
);

export const aditivosContratos = pgTable("aditivos_contratos", {
  id: serial("id").primaryKey(),
  contratoId: integer("contrato_id")
    .notNull()
    .references(() => contratos.id, { onDelete: "cascade" }),
  numeroAditivo: integer("numero_aditivo").notNull(),
  tipo: varchar("tipo", { length: 64 }).notNull(),
  descricao: text("descricao").notNull(),
  valorAditado: numeric("valor_aditado", { precision: 14, scale: 2 }),
  diasAdicionados: integer("dias_adicionados"),
  dataAssinatura: date("data_assinatura"),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const alertas = pgTable(
  "alertas",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id").references(() => processos.id, {
      onDelete: "cascade",
    }),
    contratoId: integer("contrato_id").references(() => contratos.id, {
      onDelete: "cascade",
    }),
    tipo: alertaTipoEnum("tipo").notNull(),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    descricao: text("descricao"),
    dataAlerta: date("data_alerta").notNull(),
    lido: boolean("lido").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("alertas_processo_idx").on(table.processoId),
    idxContrato: index("alertas_contrato_idx").on(table.contratoId),
  }),
);

export const notificacoesUsuario = pgTable(
  "notificacoes_usuario",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    processoId: integer("processo_id").references(() => processos.id, {
      onDelete: "cascade",
    }),
    documentoId: integer("documento_id").references(() => documentos.id, {
      onDelete: "cascade",
    }),
    prazoId: integer("prazo_id").references(() => prazosProcessuais.id, {
      onDelete: "cascade",
    }),
    tipo: notificacaoTipoEnum("tipo").notNull().default("SISTEMA"),
    prioridade: notificacaoPrioridadeEnum("prioridade")
      .notNull()
      .default("BAIXA"),
    chave: varchar("chave", { length: 255 }).notNull(),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    mensagem: text("mensagem").notNull(),
    href: varchar("href", { length: 255 }),
    acaoRelacionada: jsonb("acao_relacionada"),
    origemAutomatica: boolean("origem_automatica").notNull().default(true),
    lida: boolean("lida").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dataExpiracao: timestamp("data_expiracao", { withTimezone: true }),
  },
  (table) => ({
    idxUser: index("notificacoes_usuario_user_idx").on(table.userId),
    idxLida: index("notificacoes_usuario_lida_idx").on(table.lida),
    idxExpiracao: index("notificacoes_usuario_expiracao_idx").on(
      table.dataExpiracao,
    ),
    uqChavePorUsuario: uniqueIndex("notificacoes_usuario_user_chave_uq").on(
      table.userId,
      table.chave,
    ),
  }),
);

export const importacaoBllExecucoes = pgTable(
  "importacao_bll_execucoes",
  {
    id: serial("id").primaryKey(),
    origem: importacaoBllOrigemEnum("origem").notNull(),
    modo: importacaoBllModoEnum("modo").notNull(),
    status: importacaoBllStatusExecucaoEnum("status")
      .notNull()
      .default("PROCESSANDO"),
    agendada: boolean("agendada").notNull().default(false),
    referenciaRotina: date("referencia_rotina"),
    urlFonte: varchar("url_fonte", { length: 500 }),
    arquivoRegistrosNome: varchar("arquivo_registros_nome", { length: 255 }),
    arquivoItensNome: varchar("arquivo_itens_nome", { length: 255 }),
    atualizadoFonteEm: timestamp("atualizado_fonte_em", { withTimezone: true }),
    totalRegistros: integer("total_registros").notNull().default(0),
    totalItens: integer("total_itens").notNull().default(0),
    mensagem: text("mensagem"),
    detalhes: jsonb("detalhes"),
    criadoPor: integer("criado_por").references(() => users.id),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
  },
  (table) => ({
    idxOrigem: index("importacao_bll_execucoes_origem_idx").on(table.origem),
    idxStatus: index("importacao_bll_execucoes_status_idx").on(table.status),
    idxIniciadoEm: index("importacao_bll_execucoes_iniciado_em_idx").on(
      table.iniciadoEm,
    ),
    idxReferenciaRotina: index(
      "importacao_bll_execucoes_referencia_rotina_idx",
    ).on(table.referenciaRotina),
  }),
);

export const importacaoBllProcessos = pgTable(
  "importacao_bll_processos",
  {
    id: serial("id").primaryKey(),
    origem: importacaoBllOrigemEnum("origem").notNull(),
    chaveExterna: varchar("chave_externa", { length: 120 }).notNull(),
    idOrigem: varchar("id_origem", { length: 120 }),
    numeroEdital: varchar("numero_edital", { length: 120 }),
    numeroAdministrativo: varchar("numero_administrativo", { length: 120 }),
    anoReferencia: integer("ano_referencia"),
    modalidade: varchar("modalidade", { length: 160 }).notNull(),
    situacaoExterna: varchar("situacao_externa", { length: 160 }),
    tipoContrato: varchar("tipo_contrato", { length: 160 }),
    artigo: varchar("artigo", { length: 120 }),
    inciso: varchar("inciso", { length: 120 }),
    objeto: text("objeto").notNull(),
    condutorNome: varchar("condutor_nome", { length: 255 }),
    coordenadorNome: varchar("coordenador_nome", { length: 255 }),
    autoridadeNome: varchar("autoridade_nome", { length: 255 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
    publicacaoEm: timestamp("publicacao_em", { withTimezone: true }),
    conclusaoEm: timestamp("conclusao_em", { withTimezone: true }),
    inicioRecepcaoEm: timestamp("inicio_recepcao_em", { withTimezone: true }),
    fimRecepcaoEm: timestamp("fim_recepcao_em", { withTimezone: true }),
    inicioDisputaEm: timestamp("inicio_disputa_em", { withTimezone: true }),
    linkExterno: varchar("link_externo", { length: 500 }),
    totalLotes: integer("total_lotes").notNull().default(0),
    totalItens: integer("total_itens").notNull().default(0),
    processoInternoId: integer("processo_interno_id").references(
      () => processos.id,
      { onDelete: "set null" },
    ),
    statusConciliacao: importacaoBllConciliacaoStatusEnum("status_conciliacao")
      .notNull()
      .default("PENDENTE"),
    scoreConciliacao: integer("score_conciliacao"),
    detalhesConciliacao: jsonb("detalhes_conciliacao"),
    conciliadoPor: integer("conciliado_por").references(() => users.id),
    conciliadoEm: timestamp("conciliado_em", { withTimezone: true }),
    ultimaExecucaoId: integer("ultima_execucao_id").references(
      () => importacaoBllExecucoes.id,
      { onDelete: "set null" },
    ),
    primeiraCapturaEm: timestamp("primeira_captura_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ultimaAtualizacaoEm: timestamp("ultima_atualizacao_em", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    dadosOriginais: jsonb("dados_originais"),
  },
  (table) => ({
    uqOrigemChave: uniqueIndex("importacao_bll_processos_origem_chave_uq").on(
      table.origem,
      table.chaveExterna,
    ),
    uqProcessoInterno: uniqueIndex(
      "importacao_bll_processos_processo_interno_uq",
    ).on(table.processoInternoId),
    idxNumeroEdital: index("importacao_bll_processos_numero_edital_idx").on(
      table.numeroEdital,
    ),
    idxNumeroAdministrativo: index(
      "importacao_bll_processos_numero_adm_idx",
    ).on(table.numeroAdministrativo),
    idxModalidade: index("importacao_bll_processos_modalidade_idx").on(
      table.modalidade,
    ),
    idxStatusConciliacao: index(
      "importacao_bll_processos_status_conciliacao_idx",
    ).on(table.statusConciliacao),
    idxProcessoInterno: index(
      "importacao_bll_processos_processo_interno_idx",
    ).on(table.processoInternoId),
    idxPublicacaoEm: index("importacao_bll_processos_publicacao_em_idx").on(
      table.publicacaoEm,
    ),
    idxUltimaExecucao: index("importacao_bll_processos_execucao_idx").on(
      table.ultimaExecucaoId,
    ),
  }),
);

export const importacaoBllItens = pgTable(
  "importacao_bll_itens",
  {
    id: serial("id").primaryKey(),
    processoImportadoId: integer("processo_importado_id")
      .notNull()
      .references(() => importacaoBllProcessos.id, { onDelete: "cascade" }),
    loteNumero: varchar("lote_numero", { length: 32 }),
    itemNumero: varchar("item_numero", { length: 32 }),
    descricao: text("descricao").notNull(),
    unidade: varchar("unidade", { length: 64 }),
    quantidade: numeric("quantidade", { precision: 14, scale: 4 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    marca: varchar("marca", { length: 120 }),
    modelo: varchar("modelo", { length: 120 }),
    valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }),
    situacaoExterna: varchar("situacao_externa", { length: 120 }),
    faseExterna: varchar("fase_externa", { length: 120 }),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcessoImportado: index("importacao_bll_itens_processo_idx").on(
      table.processoImportadoId,
    ),
    idxLoteNumero: index("importacao_bll_itens_lote_idx").on(table.loteNumero),
    idxFornecedor: index("importacao_bll_itens_fornecedor_idx").on(
      table.fornecedorNome,
    ),
  }),
);

export const authLog = pgTable(
  "auth_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    loginInformado: varchar("login_informado", { length: 120 }),
    loginNormalizado: varchar("login_normalizado", { length: 120 }),
    ipAddress: varchar("ip_address", { length: 120 }),
    evento: authEventTypeEnum("evento").notNull(),
    detalhe: text("detalhe"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxUser: index("auth_log_user_idx").on(table.userId),
    idxLogin: index("auth_log_login_idx").on(table.loginNormalizado),
    idxEvento: index("auth_log_evento_idx").on(table.evento),
    idxCriadoEm: index("auth_log_criado_em_idx").on(table.criadoEm),
  }),
);

export const auditoriaLog = pgTable(
  "auditoria_log",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => users.id),
    tabela: varchar("tabela", { length: 120 }).notNull(),
    registroId: integer("registro_id").notNull(),
    acao: auditoriaAcaoEnum("acao").notNull(),
    dadosAnteriores: jsonb("dados_anteriores"),
    dadosNovos: jsonb("dados_novos"),
    descricao: text("descricao"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxUsuario: index("auditoria_usuario_idx").on(table.usuarioId),
    idxTabela: index("auditoria_tabela_idx").on(table.tabela),
  }),
);
