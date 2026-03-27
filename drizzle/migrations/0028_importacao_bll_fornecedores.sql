CREATE TABLE IF NOT EXISTS "importacao_bll_fornecedores" (
  "id" serial PRIMARY KEY,
  "nome" varchar(255) NOT NULL,
  "nome_normalizado" varchar(255) NOT NULL,
  "documento" varchar(20),
  "dados_originais" jsonb,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "importacao_bll_fornecedores_nome_idx" ON "importacao_bll_fornecedores" ("nome");
CREATE UNIQUE INDEX IF NOT EXISTS "importacao_bll_fornecedores_nome_uq" ON "importacao_bll_fornecedores" ("nome_normalizado");
CREATE UNIQUE INDEX IF NOT EXISTS "importacao_bll_fornecedores_documento_uq" ON "importacao_bll_fornecedores" ("documento");

ALTER TABLE "importacao_bll_itens"
  ADD COLUMN IF NOT EXISTS "fornecedor_importado_id" integer REFERENCES "importacao_bll_fornecedores" ("id") ON DELETE set null;

ALTER TABLE "importacao_bll_itens_especificados"
  ADD COLUMN IF NOT EXISTS "fornecedor_importado_id" integer REFERENCES "importacao_bll_fornecedores" ("id") ON DELETE set null;

ALTER TABLE "importacao_bll_lotes"
  ADD COLUMN IF NOT EXISTS "vencedor_fornecedor_id" integer REFERENCES "importacao_bll_fornecedores" ("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "importacao_bll_itens_fornecedor_importado_idx" ON "importacao_bll_itens" ("fornecedor_importado_id");
CREATE INDEX IF NOT EXISTS "importacao_bll_itens_espec_fornecedor_idx" ON "importacao_bll_itens_especificados" ("fornecedor_importado_id");
CREATE INDEX IF NOT EXISTS "importacao_bll_lotes_vencedor_fornecedor_idx" ON "importacao_bll_lotes" ("vencedor_fornecedor_id");
