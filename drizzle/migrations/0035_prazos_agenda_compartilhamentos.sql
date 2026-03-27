CREATE TYPE "agenda_compartilhamento_permissao" AS ENUM ('SOMENTE_VISUALIZACAO', 'COMENTARIOS');

CREATE TABLE "prazos_agenda_compartilhamentos" (
  "id" serial PRIMARY KEY,
  "token" varchar(64) NOT NULL,
  "compartilhado_por_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "compartilhado_com_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "permissao" "agenda_compartilhamento_permissao" NOT NULL DEFAULT 'SOMENTE_VISUALIZACAO',
  "filtros" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ativo" boolean NOT NULL DEFAULT true,
  "expira_em" timestamp with time zone,
  "ultimo_acesso_em" timestamp with time zone,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "prazos_agenda_compartilhamentos_token_uq" ON "prazos_agenda_compartilhamentos" ("token");
CREATE INDEX "prazos_agenda_compartilhamentos_compartilhado_por_idx" ON "prazos_agenda_compartilhamentos" ("compartilhado_por_id");
CREATE INDEX "prazos_agenda_compartilhamentos_compartilhado_com_idx" ON "prazos_agenda_compartilhamentos" ("compartilhado_com_id");
CREATE INDEX "prazos_agenda_compartilhamentos_ativo_idx" ON "prazos_agenda_compartilhamentos" ("ativo");