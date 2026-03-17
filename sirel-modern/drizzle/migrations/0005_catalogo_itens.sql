CREATE TABLE "catalogo_itens" (
  "id" serial PRIMARY KEY NOT NULL,
  "descricao" text NOT NULL,
  "unidade_padrao" varchar(32) NOT NULL,
  "valor_referencia" numeric(14, 2),
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "catalogo_itens_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);

CREATE INDEX "catalogo_itens_descricao_idx" ON "catalogo_itens" USING btree ("descricao");
