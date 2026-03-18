CREATE TABLE "etp" (
  "id" serial PRIMARY KEY NOT NULL,
  "processo_id" integer NOT NULL UNIQUE,
  "descricao_necessidade" text NOT NULL,
  "analise_solucoes_mercado" text NOT NULL,
  "justificativa_tecnica" text NOT NULL,
  "providencias_previas" text,
  "conclusao_viabilidade" text NOT NULL,
  "observacoes" text,
  "concluido" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "etp_processo_id_processos_id_fk"
    FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "etp_cotacoes_preliminares" (
  "id" serial PRIMARY KEY NOT NULL,
  "etp_id" integer NOT NULL,
  "item_id" integer NOT NULL,
  "fonte" varchar(255) NOT NULL,
  "fornecedor_nome" varchar(255) NOT NULL,
  "documento" varchar(80),
  "data_cotacao" date,
  "quantidade_considerada" numeric(14, 3) NOT NULL,
  "valor_unitario" numeric(14, 2) NOT NULL,
  "valor_total" numeric(14, 2) NOT NULL,
  "observacao" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "etp_cotacoes_preliminares_etp_id_etp_id_fk"
    FOREIGN KEY ("etp_id") REFERENCES "public"."etp"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "etp_cotacoes_preliminares_item_id_itens_processo_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."itens_processo"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX "etp_cotacoes_preliminares_etp_idx"
  ON "etp_cotacoes_preliminares" USING btree ("etp_id");

CREATE INDEX "etp_cotacoes_preliminares_item_idx"
  ON "etp_cotacoes_preliminares" USING btree ("item_id");
