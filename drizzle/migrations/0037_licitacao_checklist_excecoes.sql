CREATE TABLE "licitacao_checklist_excecoes" (
  "id" serial PRIMARY KEY,
  "processo_id" integer NOT NULL REFERENCES "processos"("id") ON DELETE CASCADE,
  "categoria" varchar(160) NOT NULL,
  "nao_aplicavel" boolean NOT NULL DEFAULT false,
  "justificativa" text,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "licitacao_checklist_excecoes_processo_idx" ON "licitacao_checklist_excecoes" ("processo_id");
CREATE UNIQUE INDEX "licitacao_checklist_excecoes_processo_categoria_uq" ON "licitacao_checklist_excecoes" ("processo_id", "categoria");
