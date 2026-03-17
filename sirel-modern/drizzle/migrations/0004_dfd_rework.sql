CREATE TYPE "public"."prioridade_dfd" AS ENUM('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

ALTER TABLE "dfd"
  ADD COLUMN "grau_prioridade" "prioridade_dfd" DEFAULT 'MEDIA' NOT NULL,
  ADD COLUMN "demanda_sistemica" boolean DEFAULT false NOT NULL,
  ADD COLUMN "data_necessidade" date,
  ADD COLUMN "data_prevista_conclusao" date,
  ADD COLUMN "secretaria_responsavel_id" integer,
  ADD COLUMN "solicitante_user_id" integer;

ALTER TABLE "dfd"
  ADD CONSTRAINT "dfd_secretaria_responsavel_id_secretarias_id_fk"
    FOREIGN KEY ("secretaria_responsavel_id") REFERENCES "public"."secretarias"("id") ON DELETE no action ON UPDATE no action,
  ADD CONSTRAINT "dfd_solicitante_user_id_users_id_fk"
    FOREIGN KEY ("solicitante_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "dfd" DROP COLUMN IF EXISTS "necessidade_contratacao";
ALTER TABLE "dfd" DROP COLUMN IF EXISTS "resultados_pretendidos";
ALTER TABLE "dfd" DROP COLUMN IF EXISTS "responsavel_id";

CREATE TABLE "dfd_responsaveis" (
  "id" serial PRIMARY KEY NOT NULL,
  "dfd_id" integer NOT NULL,
  "pessoa_id" integer NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dfd_responsaveis_dfd_id_dfd_id_fk" FOREIGN KEY ("dfd_id") REFERENCES "public"."dfd"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "dfd_responsaveis_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX "dfd_responsaveis_dfd_pessoa_uq" ON "dfd_responsaveis" USING btree ("dfd_id","pessoa_id");

CREATE TABLE "dfd_secretarias_participantes" (
  "id" serial PRIMARY KEY NOT NULL,
  "dfd_id" integer NOT NULL,
  "secretaria_id" integer NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dfd_secretarias_participantes_dfd_id_dfd_id_fk" FOREIGN KEY ("dfd_id") REFERENCES "public"."dfd"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "dfd_secretarias_participantes_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX "dfd_secretarias_participantes_dfd_secretaria_uq" ON "dfd_secretarias_participantes" USING btree ("dfd_id","secretaria_id");
