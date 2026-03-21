-- Phase 1: Add critical fields for data preservation in importacao_bll_processos
-- This migration adds fields that were being lost during import:
-- - justificativa: Legal justification for dispensas/inexigibilidades
-- - legislacao_aplicavel: Reference to applicable legislation (e.g., "Lei 14.133/2021")
-- - observacoes: Operational notes
-- - cota_me: Flag indicating if lot has ME/EPP reserved quota
-- - codigo_pncp: External PNCP code for reconciliation
-- - url_pncp: Direct link to PNCP record
-- - data_sincronizacao_pncp: Last PNCP sync timestamp
-- - completeness_score: Quality metric (0-100) for imported data
-- - last_validation_at: Last validation timestamp

ALTER TABLE "importacao_bll_processos"
  ADD COLUMN "justificativa" text,
  ADD COLUMN "legislacao_aplicavel" varchar(255),
  ADD COLUMN "observacoes" text,
  ADD COLUMN "cota_me" boolean DEFAULT false,
  ADD COLUMN "codigo_pncp" varchar(100),
  ADD COLUMN "url_pncp" varchar(500),
  ADD COLUMN "data_sincronizacao_pncp" timestamp with time zone,
  ADD COLUMN "completeness_score" integer DEFAULT 0,
  ADD COLUMN "last_validation_at" timestamp with time zone;

-- Add indexes for new searchable fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS "importacao_bll_processos_pncp_idx" 
  ON "importacao_bll_processos" ("codigo_pncp") 
  WHERE "codigo_pncp" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "importacao_bll_processos_completude_idx" 
  ON "importacao_bll_processos" ("completeness_score");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "importacao_bll_processos_justificativa_gin" 
  ON "importacao_bll_processos" USING gin(to_tsvector('portuguese', "justificativa"));

-- New table: Lotes importados (hierarchical structure under processo)
CREATE TABLE IF NOT EXISTS "importacao_bll_lotes" (
  "id" serial PRIMARY KEY,
  "processo_importado_id" integer NOT NULL REFERENCES "importacao_bll_processos"("id") ON DELETE CASCADE,
  "numero" varchar(32) NOT NULL,
  "titulo" text NOT NULL,
  "tipo" varchar(32), -- "GLOBAL" | "ITEM" | "LOTE"
  "fase_atual" varchar(64),
  "intervalo_minimo_lance" numeric(14, 2),
  "exclusivo_me" boolean DEFAULT false,
  "local_entrega" text,
  "garantia_exigida" text,
  "valor_referencia" numeric(14, 2),
  "valor_homologado" numeric(14, 2),
  "vencedor" varchar(255),
  "dados_originais" jsonb,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now(),
  CONSTRAINT "importacao_bll_lotes_processo_numero_uq" UNIQUE ("processo_importado_id", "numero")
);

CREATE INDEX "importacao_bll_lotes_processo_idx" ON "importacao_bll_lotes" ("processo_importado_id");
CREATE INDEX "importacao_bll_lotes_vencedor_idx" ON "importacao_bll_lotes" ("vencedor");
CREATE INDEX "importacao_bll_lotes_tipo_idx" ON "importacao_bll_lotes" ("tipo");

-- New table: Itens com especificações técnicas completas
CREATE TABLE IF NOT EXISTS "importacao_bll_itens_especificados" (
  "id" serial PRIMARY KEY,
  "lote_importado_id" integer REFERENCES "importacao_bll_lotes"("id") ON DELETE CASCADE,
  "processo_importado_id" integer NOT NULL REFERENCES "importacao_bll_processos"("id") ON DELETE CASCADE,
  "numero_item" varchar(32) NOT NULL,
  "codigo_catalogo" varchar(64),
  "descricao_resumida" text NOT NULL,
  "especificacao_tecnica" text,
  "unidade_medida" varchar(32),
  "quantidade" numeric(14, 4),
  "valor_referencia_unitario" numeric(14, 2),
  "valor_homologado_unitario" numeric(14, 2),
  "subtotal_referencia" numeric(14, 2),
  "subtotal_homologado" numeric(14, 2),
  "fornecedor_homologado" varchar(255),
  "marca_homologada" varchar(120),
  "modelo_homologado" varchar(120),
  "catalogoInterno_id" integer REFERENCES "catalogo_sirel_items"("id") ON DELETE SET NULL,
  "similaridade_catalogo" numeric(3, 2),
  "dados_originais" jsonb,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);

CREATE INDEX "importacao_bll_itens_proc_idx" ON "importacao_bll_itens_especificados" ("processo_importado_id");
CREATE INDEX "importacao_bll_itens_lote_idx" ON "importacao_bll_itens_especificados" ("lote_importado_id");
CREATE INDEX "importacao_bll_itens_catalogo_idx" ON "importacao_bll_itens_especificados" ("catalogoInterno_id");
CREATE INDEX "importacao_bll_itens_codigo_catalogo_idx" ON "importacao_bll_itens_especificados" ("codigo_catalogo");

-- Full-text search index for technical specifications (Portuguese)
CREATE INDEX "importacao_bll_itens_espec_gin" 
  ON "importacao_bll_itens_especificados" 
  USING gin(to_tsvector('portuguese', "especificacao_tecnica"));

-- Add audit tracking for post-import edits
CREATE TABLE IF NOT EXISTS "importacao_bll_edicoes_audit" (
  "id" serial PRIMARY KEY,
  "processo_importado_id" integer NOT NULL REFERENCES "importacao_bll_processos"("id") ON DELETE CASCADE,
  "usuario_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "campos_alterados" jsonb NOT NULL, -- Array of {field, old_value, new_value}
  "justificativa" text NOT NULL,
  "origem_edicao" varchar(32) DEFAULT 'MANUAL', -- "MANUAL" | "IMPORTACAO_BLL" | "PNCP_SYNC"
  "criado_em" timestamp with time zone DEFAULT now()
);

CREATE INDEX "importacao_bll_edicoes_audit_processo_idx" ON "importacao_bll_edicoes_audit" ("processo_importado_id");
CREATE INDEX "importacao_bll_edicoes_audit_usuario_idx" ON "importacao_bll_edicoes_audit" ("usuario_id");
