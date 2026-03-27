CREATE TYPE "public"."importacao_pncp_status_execucao" AS ENUM('PROCESSANDO', 'CONCLUIDA', 'ERRO');

CREATE TABLE IF NOT EXISTS "importacao_pncp_execucoes" (
  "id" serial PRIMARY KEY,
  "data_inicio" date,
  "data_fim" date,
  "status" "public"."importacao_pncp_status_execucao" NOT NULL DEFAULT 'PROCESSANDO',
  "agendada" boolean NOT NULL DEFAULT false,
  "total_contratacoes" integer NOT NULL DEFAULT 0,
  "total_itens_contratacao" integer NOT NULL DEFAULT 0,
  "total_atas" integer NOT NULL DEFAULT 0,
  "total_itens_ata" integer NOT NULL DEFAULT 0,
  "total_contratos" integer NOT NULL DEFAULT 0,
  "total_aditivos" integer NOT NULL DEFAULT 0,
  "total_fornecedores" integer NOT NULL DEFAULT 0,
  "mensagem" text,
  "erros" jsonb,
  "detalhes" jsonb,
  "criado_por" integer,
  "iniciado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "finalizado_em" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "importacao_pncp_execucoes_status_idx"
ON "importacao_pncp_execucoes" USING btree ("status");

CREATE INDEX IF NOT EXISTS "importacao_pncp_execucoes_periodo_idx"
ON "importacao_pncp_execucoes" USING btree ("data_inicio", "data_fim");

CREATE TABLE IF NOT EXISTS "importacao_pncp_fornecedores" (
  "id" serial PRIMARY KEY,
  "documento" varchar(32),
  "nome" varchar(255) NOT NULL,
  "tipo" varchar(8),
  "municipio" varchar(120),
  "uf" varchar(2),
  "dados_originais" jsonb,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_pncp_fornecedores_documento_uq"
ON "importacao_pncp_fornecedores" USING btree ("documento");

CREATE INDEX IF NOT EXISTS "importacao_pncp_fornecedores_nome_idx"
ON "importacao_pncp_fornecedores" USING btree ("nome");

CREATE TABLE IF NOT EXISTS "importacao_pncp_contratacoes" (
  "id" serial PRIMARY KEY,
  "numero_controle_pncp" varchar(120) NOT NULL,
  "ano_compra" integer,
  "sequencial_compra" integer,
  "modalidade" varchar(160),
  "modo_disputa" varchar(160),
  "criterio_julgamento" varchar(160),
  "objeto" text,
  "valor_total_estimado" numeric(14,2),
  "data_publicacao" timestamp with time zone,
  "data_abertura_proposta" timestamp with time zone,
  "data_encerramento_proposta" timestamp with time zone,
  "orgao_entidade_nome" varchar(255),
  "orgao_entidade_cnpj" varchar(32),
  "unidade_nome" varchar(255),
  "situacao" varchar(160),
  "url_processo" varchar(500),
  "dados_originais" jsonb,
  "ultima_execucao_id" integer,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_pncp_contratacoes_controle_uq"
ON "importacao_pncp_contratacoes" USING btree ("numero_controle_pncp");

CREATE INDEX IF NOT EXISTS "importacao_pncp_contratacoes_publicacao_idx"
ON "importacao_pncp_contratacoes" USING btree ("data_publicacao");

CREATE TABLE IF NOT EXISTS "importacao_pncp_itens_contratacao" (
  "id" serial PRIMARY KEY,
  "contratacao_id" integer NOT NULL,
  "numero_item" varchar(64),
  "descricao" text,
  "unidade" varchar(64),
  "quantidade" numeric(14,4),
  "valor_unitario" numeric(14,2),
  "valor_total" numeric(14,2),
  "situacao" varchar(120),
  "fornecedor_nome" varchar(255),
  "fornecedor_documento" varchar(32),
  "fornecedor_importado_id" integer,
  "dados_originais" jsonb,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "importacao_pncp_itens_contratacao_idx"
ON "importacao_pncp_itens_contratacao" USING btree ("contratacao_id");

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_pncp_itens_contratacao_uq"
ON "importacao_pncp_itens_contratacao" USING btree ("contratacao_id", "numero_item");

CREATE TABLE IF NOT EXISTS "importacao_pncp_atas" (
  "id" serial PRIMARY KEY,
  "id_ata_pncp" varchar(120) NOT NULL,
  "numero_ata" varchar(120),
  "objeto" text,
  "valor_global" numeric(14,2),
  "data_assinatura" timestamp with time zone,
  "data_inicio_vigencia" timestamp with time zone,
  "data_fim_vigencia" timestamp with time zone,
  "situacao" varchar(120),
  "orgao_gerenciador_nome" varchar(255),
  "orgao_gerenciador_cnpj" varchar(32),
  "fornecedor_nome" varchar(255),
  "fornecedor_documento" varchar(32),
  "fornecedor_importado_id" integer,
  "url_ata" varchar(500),
  "dados_originais" jsonb,
  "ultima_execucao_id" integer,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_pncp_atas_id_uq"
ON "importacao_pncp_atas" USING btree ("id_ata_pncp");

CREATE INDEX IF NOT EXISTS "importacao_pncp_atas_vigencia_idx"
ON "importacao_pncp_atas" USING btree ("data_inicio_vigencia", "data_fim_vigencia");

CREATE TABLE IF NOT EXISTS "importacao_pncp_itens_ata" (
  "id" serial PRIMARY KEY,
  "ata_id" integer NOT NULL,
  "numero_item" varchar(64),
  "descricao" text,
  "unidade" varchar(64),
  "quantidade" numeric(14,4),
  "valor_unitario" numeric(14,2),
  "valor_total" numeric(14,2),
  "fornecedor_nome" varchar(255),
  "fornecedor_documento" varchar(32),
  "fornecedor_importado_id" integer,
  "dados_originais" jsonb,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "importacao_pncp_itens_ata_idx"
ON "importacao_pncp_itens_ata" USING btree ("ata_id");

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_pncp_itens_ata_uq"
ON "importacao_pncp_itens_ata" USING btree ("ata_id", "numero_item");

CREATE TABLE IF NOT EXISTS "importacao_pncp_contratos" (
  "id" serial PRIMARY KEY,
  "id_contrato_pncp" varchar(120) NOT NULL,
  "numero_contrato" varchar(120),
  "objeto" text,
  "modalidade" varchar(160),
  "valor_total" numeric(14,2),
  "data_assinatura" timestamp with time zone,
  "data_inicio_vigencia" timestamp with time zone,
  "data_fim_vigencia" timestamp with time zone,
  "data_encerramento" timestamp with time zone,
  "situacao" varchar(120),
  "fornecedor_nome" varchar(255),
  "fornecedor_documento" varchar(32),
  "fornecedor_importado_id" integer,
  "url_contrato" varchar(500),
  "dados_originais" jsonb,
  "ultima_execucao_id" integer,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_pncp_contratos_id_uq"
ON "importacao_pncp_contratos" USING btree ("id_contrato_pncp");

CREATE INDEX IF NOT EXISTS "importacao_pncp_contratos_vigencia_idx"
ON "importacao_pncp_contratos" USING btree ("data_inicio_vigencia", "data_fim_vigencia");

CREATE TABLE IF NOT EXISTS "importacao_pncp_aditivos" (
  "id" serial PRIMARY KEY,
  "contrato_id" integer NOT NULL,
  "id_aditivo_pncp" varchar(120),
  "numero_aditivo" varchar(120),
  "tipo_aditivo" varchar(160),
  "objeto" text,
  "valor_aditivo" numeric(14,2),
  "data_assinatura" timestamp with time zone,
  "data_inicio_vigencia" timestamp with time zone,
  "data_fim_vigencia" timestamp with time zone,
  "dados_originais" jsonb,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "importacao_pncp_aditivos_contrato_idx"
ON "importacao_pncp_aditivos" USING btree ("contrato_id");

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_pncp_aditivos_uq"
ON "importacao_pncp_aditivos" USING btree ("contrato_id", "id_aditivo_pncp");

