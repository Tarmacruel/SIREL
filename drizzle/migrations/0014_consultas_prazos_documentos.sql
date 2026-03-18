DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prazo_processual_tipo') THEN
    CREATE TYPE "public"."prazo_processual_tipo" AS ENUM(
      'PUBLICACAO_EDITAL',
      'RECEBIMENTO_PROPOSTAS',
      'SESSAO_PUBLICA',
      'JULGAMENTO',
      'RECURSOS',
      'HOMOLOGACAO',
      'PUBLICACAO_RESULTADO',
      'ASSINATURA_CONTRATO'
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prazo_processual_status') THEN
    CREATE TYPE "public"."prazo_processual_status" AS ENUM('PENDENTE', 'EM_ATRASO', 'CONCLUIDO');
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "data_referencia" date;
--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "palavras_chave" jsonb;
--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "publico" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "restrito_a" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prazos_processuais" (
  "id" serial PRIMARY KEY NOT NULL,
  "processo_id" integer NOT NULL,
  "tipo" "prazo_processual_tipo" NOT NULL,
  "titulo" varchar(200) NOT NULL,
  "data_prevista" date NOT NULL,
  "data_realizada" date,
  "status" "prazo_processual_status" DEFAULT 'PENDENTE' NOT NULL,
  "alertas_config" jsonb DEFAULT '{"lembretes":[7,3,1],"canais":["sistema"]}'::jsonb NOT NULL,
  "observacao" text,
  "criado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'prazos_processuais_processo_id_processos_id_fk'
      AND table_name = 'prazos_processuais'
  ) THEN
    ALTER TABLE "prazos_processuais"
      ADD CONSTRAINT "prazos_processuais_processo_id_processos_id_fk"
      FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'prazos_processuais_criado_por_users_id_fk'
      AND table_name = 'prazos_processuais'
  ) THEN
    ALTER TABLE "prazos_processuais"
      ADD CONSTRAINT "prazos_processuais_criado_por_users_id_fk"
      FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentos_tipo_idx" ON "documentos" USING btree ("tipo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentos_data_referencia_idx" ON "documentos" USING btree ("data_referencia");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prazos_processuais_processo_idx" ON "prazos_processuais" USING btree ("processo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prazos_processuais_status_idx" ON "prazos_processuais" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prazos_processuais_tipo_idx" ON "prazos_processuais" USING btree ("tipo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prazos_processuais_data_prevista_idx" ON "prazos_processuais" USING btree ("data_prevista");
