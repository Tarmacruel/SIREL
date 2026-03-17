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
  varchar
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "gestor", "operador"]);
export const escopoDisputaEnum = pgEnum("escopo_disputa", ["ITEM", "LOTE", "GLOBAL"]);
export const tipoObjetoEnum = pgEnum("tipo_objeto", ["PRODUTO", "SERVICO", "OBRA", "SERVICO_ENG"]);
export const tipoContratacaoEnum = pgEnum("tipo_contratacao", ["AQUISICAO", "REGISTRO_PRECO", "AQUISICAO_PARCELADA"]);
export const documentoTipoEnum = pgEnum("documento_tipo", ["DFD", "ETP", "TR", "EDITAL", "COMUNICACAO_INTERNA", "RESULTADO", "CONTRATO", "OUTRO"]);
export const workflowModuloEnum = pgEnum("workflow_modulo", ["PLANEJAMENTO", "COMPRAS", "LICITACAO", "PROCURADORIA", "CONTROLADORIA", "CONTRATOS", "DOCUMENTOS"]);
export const workflowSituacaoEnum = pgEnum("workflow_situacao", ["RASCUNHO", "EM_ANDAMENTO", "AGUARDANDO", "CONCLUIDO", "SUSPENSO"]);
export const contratoStatusEnum = pgEnum("contrato_status", ["ATIVO", "ENCERRADO", "SUSPENSO", "RESCINDIDO"]);
export const alertaTipoEnum = pgEnum("alerta_tipo", ["VENCIMENTO", "PRAZO", "APROVACAO", "DOCUMENTACAO"]);
export const auditoriaAcaoEnum = pgEnum("auditoria_acao", ["CREATE", "UPDATE", "DELETE"]);
export const cotacaoStatusEnum = pgEnum("cotacao_status", ["ATIVA", "VENCIDA", "CANCELADA"]);
export const prioridadeDfdEnum = pgEnum("prioridade_dfd", ["BAIXA", "MEDIA", "ALTA", "URGENTE"]);

export const secretarias = pgTable("secretarias", {
  id: serial("id").primaryKey(),
  sigla: varchar("sigla", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  responsavel: varchar("responsavel", { length: 255 }),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 32 }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable("users", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true })
}, (table) => ({
  idxSecretaria: index("users_secretaria_idx").on(table.secretariaId)
}));

export const pessoas = pgTable("pessoas", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  cpf: varchar("cpf", { length: 18 }),
  cargo: varchar("cargo", { length: 120 }),
  secretariaId: integer("secretaria_id").references(() => secretarias.id),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxSecretaria: index("pessoas_secretaria_idx").on(table.secretariaId)
}));

export const modalidades = pgTable("modalidades", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  ativo: boolean("ativo").notNull().default(true)
});

export const statusProcesso = pgTable("status_processo", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cor: varchar("cor", { length: 16 }),
  ativo: boolean("ativo").notNull().default(true)
});

export const processos = pgTable("processos", {
  id: serial("id").primaryKey(),
  numeroSirel: varchar("numero_sirel", { length: 64 }).notNull().unique(),
  numeroAdministrativo: varchar("numero_administrativo", { length: 64 }),
  numeroEdital: varchar("numero_edital", { length: 64 }),
  anoReferencia: integer("ano_referencia").notNull(),
  foraDoFluxo: boolean("fora_do_fluxo").notNull().default(false),
  secretariaId: integer("secretaria_id").notNull().references(() => secretarias.id),
  modalidadeId: integer("modalidade_id").references(() => modalidades.id),
  statusId: integer("status_id").references(() => statusProcesso.id),
  objeto: text("objeto").notNull(),
  valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }),
  valorHomologado: numeric("valor_homologado", { precision: 14, scale: 2 }),
  escopoDisputa: escopoDisputaEnum("escopo_disputa").notNull().default("GLOBAL"),
  criterioJulgamento: varchar("criterio_julgamento", { length: 120 }),
  modoDisputa: varchar("modo_disputa", { length: 120 }),
  tipoObjeto: tipoObjetoEnum("tipo_objeto").notNull().default("PRODUTO"),
  tipoContratacao: tipoContratacaoEnum("tipo_contratacao").notNull().default("AQUISICAO"),
  autoridadeCompetenteId: integer("autoridade_competente_id").references(() => pessoas.id),
  condutorProcessoId: integer("condutor_processo_id").references(() => pessoas.id),
  dataAbertura: date("data_abertura"),
  dataEncerramento: date("data_encerramento"),
  publicado: boolean("publicado").notNull().default(false),
  homologado: boolean("homologado").notNull().default(false),
  finalizado: boolean("finalizado").notNull().default(false),
  criadoPor: integer("criado_por").references(() => users.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxNumero: index("processos_numero_idx").on(table.numeroSirel),
  idxSecretaria: index("processos_secretaria_idx").on(table.secretariaId),
  idxStatus: index("processos_status_idx").on(table.statusId)
}));

export const workflowProcesso = pgTable("workflow_processo", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().unique().references(() => processos.id, { onDelete: "cascade" }),
  moduloAtual: workflowModuloEnum("modulo_atual").notNull().default("PLANEJAMENTO"),
  situacao: workflowSituacaoEnum("situacao").notNull().default("RASCUNHO"),
  etapaAtual: varchar("etapa_atual", { length: 255 }).notNull().default("Cadastro inicial"),
  dataInicio: date("data_inicio"),
  dataConclusao: date("data_conclusao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
});

export const dfd = pgTable("dfd", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().unique().references(() => processos.id, { onDelete: "cascade" }),
  setorDemandante: varchar("setor_demandante", { length: 255 }).notNull(),
  grauPrioridade: prioridadeDfdEnum("grau_prioridade").notNull().default("MEDIA"),
  demandaSistemica: boolean("demanda_sistemica").notNull().default(false),
  justificativa: text("justificativa").notNull(),
  dataNecessidade: date("data_necessidade"),
  dataPrevistaConclusao: date("data_prevista_conclusao"),
  observacoes: text("observacoes"),
  secretariaResponsavelId: integer("secretaria_responsavel_id").references(() => secretarias.id),
  solicitanteUserId: integer("solicitante_user_id").references(() => users.id),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const dfdResponsaveis = pgTable("dfd_responsaveis", {
  id: serial("id").primaryKey(),
  dfdId: integer("dfd_id").notNull().references(() => dfd.id, { onDelete: "cascade" }),
  pessoaId: integer("pessoa_id").notNull().references(() => pessoas.id, { onDelete: "cascade" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uqDfdPessoa: uniqueIndex("dfd_responsaveis_dfd_pessoa_uq").on(table.dfdId, table.pessoaId),
}));

export const dfdSecretariasParticipantes = pgTable("dfd_secretarias_participantes", {
  id: serial("id").primaryKey(),
  dfdId: integer("dfd_id").notNull().references(() => dfd.id, { onDelete: "cascade" }),
  secretariaId: integer("secretaria_id").notNull().references(() => secretarias.id, { onDelete: "cascade" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uqDfdSecretaria: uniqueIndex("dfd_secretarias_participantes_dfd_secretaria_uq").on(table.dfdId, table.secretariaId),
}));

export const etp = pgTable("etp", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().unique().references(() => processos.id, { onDelete: "cascade" }),
  metodologiaCotacao: varchar("metodologia_cotacao", { length: 32 }).notNull().default("MEDIA"),
  descricaoNecessidade: text("descricao_necessidade"),
  analiseSolucoesMercado: text("analise_solucoes_mercado"),
  justificativaTecnica: text("justificativa_tecnica"),
  providenciasPrevias: text("providencias_previas"),
  conclusaoViabilidade: text("conclusao_viabilidade"),
  observacoes: text("observacoes"),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogoItens = pgTable("catalogo_itens", {
  id: serial("id").primaryKey(),
  descricao: text("descricao").notNull(),
  unidadePadrao: varchar("unidade_padrao", { length: 32 }).notNull(),
  valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
  ativo: boolean("ativo").notNull().default(true),
  criadoPor: integer("criado_por").references(() => users.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idxDescricao: index("catalogo_itens_descricao_idx").on(table.descricao),
}));

export const movimentacoesWorkflow = pgTable("movimentacoes_workflow", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
  moduloOrigem: varchar("modulo_origem", { length: 64 }),
  moduloDestino: varchar("modulo_destino", { length: 64 }).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  observacao: text("observacao"),
  usuarioId: integer("usuario_id").references(() => users.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxProcesso: index("movimentacoes_processo_idx").on(table.processoId)
}));

export const lotes = pgTable("lotes", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
  numeroLote: integer("numero_lote").notNull(),
  descricao: text("descricao").notNull(),
  valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }),
  valorHomologado: numeric("valor_homologado", { precision: 14, scale: 2 }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  uqProcessoLote: uniqueIndex("lotes_processo_numero_uq").on(table.processoId, table.numeroLote)
}));

export const itensProcesso = pgTable("itens_processo", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
  loteId: integer("lote_id").references(() => lotes.id, { onDelete: "set null" }),
  numeroItem: integer("numero_item").notNull(),
  descricao: text("descricao").notNull(),
  quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
  unidade: varchar("unidade", { length: 32 }).notNull(),
  valorUnitarioEstimado: numeric("valor_unitario_estimado", { precision: 14, scale: 2 }),
  valorTotalEstimado: numeric("valor_total_estimado", { precision: 14, scale: 2 }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxProcesso: index("itens_processo_idx").on(table.processoId)
}));

export const etpCotacoesPreliminares = pgTable("etp_cotacoes_preliminares", {
  id: serial("id").primaryKey(),
  etpId: integer("etp_id").notNull().references(() => etp.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => itensProcesso.id, { onDelete: "cascade" }),
  fonte: varchar("fonte", { length: 255 }).notNull(),
  fornecedorNome: varchar("fornecedor_nome", { length: 255 }).notNull(),
  documento: varchar("documento", { length: 80 }),
  dataCotacao: date("data_cotacao"),
  quantidadeConsiderada: numeric("quantidade_considerada", { precision: 14, scale: 3 }).notNull(),
  valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }).notNull(),
  valorTotal: numeric("valor_total", { precision: 14, scale: 2 }).notNull(),
  considerada: boolean("considerada").notNull().default(true),
  motivoDesconsideracao: varchar("motivo_desconsideracao", { length: 32 }),
  justificativaDesconsideracao: text("justificativa_desconsideracao"),
  observacao: text("observacao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxEtp: index("etp_cotacoes_preliminares_etp_idx").on(table.etpId),
  idxItem: index("etp_cotacoes_preliminares_item_idx").on(table.itemId)
}));

export const fornecedores = pgTable("fornecedores", {
  id: serial("id").primaryKey(),
  razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 32 }),
  cidade: varchar("cidade", { length: 128 }),
  estado: varchar("estado", { length: 2 }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxCnpj: index("fornecedores_cnpj_idx").on(table.cnpj)
}));

export const cotacoes = pgTable("cotacoes", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => itensProcesso.id, { onDelete: "cascade" }),
  fornecedorId: integer("fornecedor_id").notNull().references(() => fornecedores.id),
  valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
  valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
  dataCotacao: date("data_cotacao"),
  status: cotacaoStatusEnum("status").notNull().default("ATIVA"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
});

export const documentos = pgTable("documentos", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  tipo: documentoTipoEnum("tipo").notNull().default("OUTRO"),
  categoria: varchar("categoria", { length: 120 }),
  versao: integer("versao").notNull().default(1),
  arquivoUrl: varchar("arquivo_url", { length: 500 }),
  arquivoChave: varchar("arquivo_chave", { length: 255 }),
  tamanhoBytes: integer("tamanho_bytes"),
  mimeType: varchar("mime_type", { length: 120 }),
  criadoPor: integer("criado_por").references(() => users.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxProcesso: index("documentos_processo_idx").on(table.processoId)
}));

export const contratos = pgTable("contratos", {
  id: serial("id").primaryKey(),
  numeroContrato: varchar("numero_contrato", { length: 64 }).notNull().unique(),
  processoId: integer("processo_id").notNull().references(() => processos.id),
  fornecedorId: integer("fornecedor_id").notNull().references(() => fornecedores.id),
  valorContrato: numeric("valor_contrato", { precision: 14, scale: 2 }),
  dataAssinatura: date("data_assinatura"),
  dataVigenciaInicio: date("data_vigencia_inicio"),
  dataVigenciaFim: date("data_vigencia_fim"),
  objeto: text("objeto").notNull(),
  status: contratoStatusEnum("status").notNull().default("ATIVO"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxProcesso: index("contratos_processo_idx").on(table.processoId),
  idxStatus: index("contratos_status_idx").on(table.status)
}));

export const aditivosContratos = pgTable("aditivos_contratos", {
  id: serial("id").primaryKey(),
  contratoId: integer("contrato_id").notNull().references(() => contratos.id, { onDelete: "cascade" }),
  numeroAditivo: integer("numero_aditivo").notNull(),
  tipo: varchar("tipo", { length: 64 }).notNull(),
  descricao: text("descricao").notNull(),
  valorAditado: numeric("valor_aditado", { precision: 14, scale: 2 }),
  diasAdicionados: integer("dias_adicionados"),
  dataAssinatura: date("data_assinatura"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow()
});

export const alertas = pgTable("alertas", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").references(() => processos.id, { onDelete: "cascade" }),
  contratoId: integer("contrato_id").references(() => contratos.id, { onDelete: "cascade" }),
  tipo: alertaTipoEnum("tipo").notNull(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  dataAlerta: date("data_alerta").notNull(),
  lido: boolean("lido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxProcesso: index("alertas_processo_idx").on(table.processoId),
  idxContrato: index("alertas_contrato_idx").on(table.contratoId)
}));

export const auditoriaLog = pgTable("auditoria_log", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").references(() => users.id),
  tabela: varchar("tabela", { length: 120 }).notNull(),
  registroId: integer("registro_id").notNull(),
  acao: auditoriaAcaoEnum("acao").notNull(),
  dadosAnteriores: jsonb("dados_anteriores"),
  dadosNovos: jsonb("dados_novos"),
  descricao: text("descricao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  idxUsuario: index("auditoria_usuario_idx").on(table.usuarioId),
  idxTabela: index("auditoria_tabela_idx").on(table.tabela)
}));
