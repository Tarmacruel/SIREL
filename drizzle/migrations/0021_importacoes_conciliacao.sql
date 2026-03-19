DO $$ BEGIN
 CREATE TYPE "public"."importacao_bll_conciliacao_status" AS ENUM('PENDENTE', 'SUGERIDO', 'VINCULADO', 'IGNORADO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "importacao_bll_processos" ADD COLUMN IF NOT EXISTS "processo_interno_id" integer;
--> statement-breakpoint
ALTER TABLE "importacao_bll_processos" ADD COLUMN IF NOT EXISTS "status_conciliacao" "importacao_bll_conciliacao_status" DEFAULT 'PENDENTE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "importacao_bll_processos" ADD COLUMN IF NOT EXISTS "score_conciliacao" integer;
--> statement-breakpoint
ALTER TABLE "importacao_bll_processos" ADD COLUMN IF NOT EXISTS "detalhes_conciliacao" jsonb;
--> statement-breakpoint
ALTER TABLE "importacao_bll_processos" ADD COLUMN IF NOT EXISTS "conciliado_por" integer;
--> statement-breakpoint
ALTER TABLE "importacao_bll_processos" ADD COLUMN IF NOT EXISTS "conciliado_em" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "importacao_bll_processos" ADD CONSTRAINT "importacao_bll_processos_processo_interno_id_processos_id_fk" FOREIGN KEY ("processo_interno_id") REFERENCES "public"."processos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "importacao_bll_processos" ADD CONSTRAINT "importacao_bll_processos_conciliado_por_users_id_fk" FOREIGN KEY ("conciliado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "importacao_bll_processos_processo_interno_uq" ON "importacao_bll_processos" USING btree ("processo_interno_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_processos_status_conciliacao_idx" ON "importacao_bll_processos" USING btree ("status_conciliacao");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_processos_processo_interno_idx" ON "importacao_bll_processos" USING btree ("processo_interno_id");
