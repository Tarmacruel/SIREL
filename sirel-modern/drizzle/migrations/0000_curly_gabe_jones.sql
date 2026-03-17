CREATE TYPE "public"."alerta_tipo" AS ENUM('VENCIMENTO', 'PRAZO', 'APROVACAO', 'DOCUMENTACAO');--> statement-breakpoint
CREATE TYPE "public"."auditoria_acao" AS ENUM('CREATE', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."contrato_status" AS ENUM('ATIVO', 'ENCERRADO', 'SUSPENSO', 'RESCINDIDO');--> statement-breakpoint
CREATE TYPE "public"."cotacao_status" AS ENUM('ATIVA', 'VENCIDA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."documento_tipo" AS ENUM('DFD', 'ETP', 'TR', 'EDITAL', 'COMUNICACAO_INTERNA', 'RESULTADO', 'CONTRATO', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."escopo_disputa" AS ENUM('ITEM', 'LOTE', 'GLOBAL');--> statement-breakpoint
CREATE TYPE "public"."tipo_contratacao" AS ENUM('AQUISICAO', 'REGISTRO_PRECO', 'AQUISICAO_PARCELADA');--> statement-breakpoint
CREATE TYPE "public"."tipo_objeto" AS ENUM('PRODUTO', 'SERVICO', 'OBRA', 'SERVICO_ENG');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'gestor', 'operador');--> statement-breakpoint
CREATE TYPE "public"."workflow_modulo" AS ENUM('PLANEJAMENTO', 'COMPRAS', 'LICITACAO', 'PROCURADORIA', 'CONTROLADORIA', 'CONTRATOS', 'DOCUMENTOS');--> statement-breakpoint
CREATE TYPE "public"."workflow_situacao" AS ENUM('RASCUNHO', 'EM_ANDAMENTO', 'AGUARDANDO', 'CONCLUIDO', 'SUSPENSO');--> statement-breakpoint
CREATE TABLE "aditivos_contratos" (
	"id" serial PRIMARY KEY NOT NULL,
	"contrato_id" integer NOT NULL,
	"numero_aditivo" integer NOT NULL,
	"tipo" varchar(64) NOT NULL,
	"descricao" text NOT NULL,
	"valor_aditado" numeric(14, 2),
	"dias_adicionados" integer,
	"data_assinatura" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer,
	"contrato_id" integer,
	"tipo" "alerta_tipo" NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"data_alerta" date NOT NULL,
	"lido" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"tabela" varchar(120) NOT NULL,
	"registro_id" integer NOT NULL,
	"acao" "auditoria_acao" NOT NULL,
	"dados_anteriores" jsonb,
	"dados_novos" jsonb,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contratos" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_contrato" varchar(64) NOT NULL,
	"processo_id" integer NOT NULL,
	"fornecedor_id" integer NOT NULL,
	"valor_contrato" numeric(14, 2),
	"data_assinatura" date,
	"data_vigencia_inicio" date,
	"data_vigencia_fim" date,
	"objeto" text NOT NULL,
	"status" "contrato_status" DEFAULT 'ATIVO' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contratos_numero_contrato_unique" UNIQUE("numero_contrato")
);
--> statement-breakpoint
CREATE TABLE "cotacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"item_id" integer,
	"fornecedor_id" integer NOT NULL,
	"valor_unitario" numeric(14, 2),
	"valor_total" numeric(14, 2),
	"data_cotacao" date,
	"status" "cotacao_status" DEFAULT 'ATIVA' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"tipo" "documento_tipo" DEFAULT 'OUTRO' NOT NULL,
	"categoria" varchar(120),
	"versao" integer DEFAULT 1 NOT NULL,
	"arquivo_url" varchar(500),
	"arquivo_chave" varchar(255),
	"tamanho_bytes" integer,
	"mime_type" varchar(120),
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"razao_social" varchar(255) NOT NULL,
	"cnpj" varchar(20) NOT NULL,
	"email" varchar(255),
	"telefone" varchar(32),
	"cidade" varchar(128),
	"estado" varchar(2),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "itens_processo" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"lote_id" integer,
	"numero_item" integer NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"unidade" varchar(32) NOT NULL,
	"valor_unitario_estimado" numeric(14, 2),
	"valor_total_estimado" numeric(14, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"numero_lote" integer NOT NULL,
	"descricao" text NOT NULL,
	"valor_estimado" numeric(14, 2),
	"valor_homologado" numeric(14, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modalidades" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(32) NOT NULL,
	"nome" varchar(255) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "modalidades_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "movimentacoes_workflow" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"modulo_origem" varchar(64),
	"modulo_destino" varchar(64) NOT NULL,
	"descricao" varchar(255) NOT NULL,
	"observacao" text,
	"usuario_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(200) NOT NULL,
	"cpf" varchar(18),
	"cargo" varchar(120),
	"secretaria_id" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processos" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_sirel" varchar(64) NOT NULL,
	"numero_administrativo" varchar(64),
	"numero_edital" varchar(64),
	"ano_referencia" integer NOT NULL,
	"secretaria_id" integer NOT NULL,
	"modalidade_id" integer,
	"status_id" integer,
	"objeto" text NOT NULL,
	"valor_estimado" numeric(14, 2),
	"valor_homologado" numeric(14, 2),
	"escopo_disputa" "escopo_disputa" DEFAULT 'GLOBAL' NOT NULL,
	"criterio_julgamento" varchar(120),
	"modo_disputa" varchar(120),
	"tipo_objeto" "tipo_objeto" DEFAULT 'PRODUTO' NOT NULL,
	"tipo_contratacao" "tipo_contratacao" DEFAULT 'AQUISICAO' NOT NULL,
	"autoridade_competente_id" integer,
	"condutor_processo_id" integer,
	"data_abertura" date,
	"data_encerramento" date,
	"publicado" boolean DEFAULT false NOT NULL,
	"homologado" boolean DEFAULT false NOT NULL,
	"finalizado" boolean DEFAULT false NOT NULL,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processos_numero_sirel_unique" UNIQUE("numero_sirel")
);
--> statement-breakpoint
CREATE TABLE "secretarias" (
	"id" serial PRIMARY KEY NOT NULL,
	"sigla" varchar(32) NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"responsavel" varchar(255),
	"email" varchar(255),
	"telefone" varchar(32),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secretarias_sigla_unique" UNIQUE("sigla")
);
--> statement-breakpoint
CREATE TABLE "status_processo" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(32) NOT NULL,
	"nome" varchar(255) NOT NULL,
	"cor" varchar(16),
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "status_processo_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(255),
	"name" text NOT NULL,
	"email" varchar(255),
	"login_method" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"secretaria_id" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_signed_in" timestamp with time zone,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_processo" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"modulo_atual" "workflow_modulo" DEFAULT 'PLANEJAMENTO' NOT NULL,
	"situacao" "workflow_situacao" DEFAULT 'RASCUNHO' NOT NULL,
	"etapa_atual" varchar(255) DEFAULT 'Cadastro inicial' NOT NULL,
	"data_inicio" date,
	"data_conclusao" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_processo_processo_id_unique" UNIQUE("processo_id")
);
--> statement-breakpoint
ALTER TABLE "aditivos_contratos" ADD CONSTRAINT "aditivos_contratos_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_log" ADD CONSTRAINT "auditoria_log_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotacoes" ADD CONSTRAINT "cotacoes_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotacoes" ADD CONSTRAINT "cotacoes_item_id_itens_processo_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."itens_processo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotacoes" ADD CONSTRAINT "cotacoes_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_processo" ADD CONSTRAINT "itens_processo_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_processo" ADD CONSTRAINT "itens_processo_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_workflow" ADD CONSTRAINT "movimentacoes_workflow_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_workflow" ADD CONSTRAINT "movimentacoes_workflow_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_modalidade_id_modalidades_id_fk" FOREIGN KEY ("modalidade_id") REFERENCES "public"."modalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_status_id_status_processo_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status_processo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_autoridade_competente_id_pessoas_id_fk" FOREIGN KEY ("autoridade_competente_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_condutor_processo_id_pessoas_id_fk" FOREIGN KEY ("condutor_processo_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_processo" ADD CONSTRAINT "workflow_processo_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_processo_idx" ON "alertas" USING btree ("processo_id");--> statement-breakpoint
CREATE INDEX "alertas_contrato_idx" ON "alertas" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX "auditoria_usuario_idx" ON "auditoria_log" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "auditoria_tabela_idx" ON "auditoria_log" USING btree ("tabela");--> statement-breakpoint
CREATE INDEX "contratos_processo_idx" ON "contratos" USING btree ("processo_id");--> statement-breakpoint
CREATE INDEX "contratos_status_idx" ON "contratos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documentos_processo_idx" ON "documentos" USING btree ("processo_id");--> statement-breakpoint
CREATE INDEX "fornecedores_cnpj_idx" ON "fornecedores" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "itens_processo_idx" ON "itens_processo" USING btree ("processo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lotes_processo_numero_uq" ON "lotes" USING btree ("processo_id","numero_lote");--> statement-breakpoint
CREATE INDEX "movimentacoes_processo_idx" ON "movimentacoes_workflow" USING btree ("processo_id");--> statement-breakpoint
CREATE INDEX "pessoas_secretaria_idx" ON "pessoas" USING btree ("secretaria_id");--> statement-breakpoint
CREATE INDEX "processos_numero_idx" ON "processos" USING btree ("numero_sirel");--> statement-breakpoint
CREATE INDEX "processos_secretaria_idx" ON "processos" USING btree ("secretaria_id");--> statement-breakpoint
CREATE INDEX "processos_status_idx" ON "processos" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "users_secretaria_idx" ON "users" USING btree ("secretaria_id");