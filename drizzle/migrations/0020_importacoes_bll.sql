DO $$ BEGIN
 CREATE TYPE "public"."importacao_bll_origem" AS ENUM('LICITACAO', 'COMPRA_DIRETA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."importacao_bll_modo" AS ENUM('REMOTA_JSON', 'CSV_MANUAL');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."importacao_bll_status_execucao" AS ENUM('PROCESSANDO', 'CONCLUIDA', 'ERRO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "importacao_bll_execucoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"origem" "importacao_bll_origem" NOT NULL,
	"modo" "importacao_bll_modo" NOT NULL,
	"status" "importacao_bll_status_execucao" DEFAULT 'PROCESSANDO' NOT NULL,
	"agendada" boolean DEFAULT false NOT NULL,
	"referencia_rotina" date,
	"url_fonte" varchar(500),
	"arquivo_registros_nome" varchar(255),
	"arquivo_itens_nome" varchar(255),
	"atualizado_fonte_em" timestamp with time zone,
	"total_registros" integer DEFAULT 0 NOT NULL,
	"total_itens" integer DEFAULT 0 NOT NULL,
	"mensagem" text,
	"detalhes" jsonb,
	"criado_por" integer,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "importacao_bll_processos" (
	"id" serial PRIMARY KEY NOT NULL,
	"origem" "importacao_bll_origem" NOT NULL,
	"chave_externa" varchar(120) NOT NULL,
	"id_origem" varchar(120),
	"numero_edital" varchar(120),
	"numero_administrativo" varchar(120),
	"ano_referencia" integer,
	"modalidade" varchar(160) NOT NULL,
	"situacao_externa" varchar(160),
	"tipo_contrato" varchar(160),
	"artigo" varchar(120),
	"inciso" varchar(120),
	"objeto" text NOT NULL,
	"condutor_nome" varchar(255),
	"coordenador_nome" varchar(255),
	"autoridade_nome" varchar(255),
	"fornecedor_nome" varchar(255),
	"valor_referencia" numeric(14, 2),
	"valor_total" numeric(14, 2),
	"publicacao_em" timestamp with time zone,
	"conclusao_em" timestamp with time zone,
	"inicio_recepcao_em" timestamp with time zone,
	"fim_recepcao_em" timestamp with time zone,
	"inicio_disputa_em" timestamp with time zone,
	"link_externo" varchar(500),
	"total_lotes" integer DEFAULT 0 NOT NULL,
	"total_itens" integer DEFAULT 0 NOT NULL,
	"ultima_execucao_id" integer,
	"primeira_captura_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_atualizacao_em" timestamp with time zone DEFAULT now() NOT NULL,
	"dados_originais" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "importacao_bll_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_importado_id" integer NOT NULL,
	"lote_numero" varchar(32),
	"item_numero" varchar(32),
	"descricao" text NOT NULL,
	"unidade" varchar(64),
	"quantidade" numeric(14, 4),
	"fornecedor_nome" varchar(255),
	"marca" varchar(120),
	"modelo" varchar(120),
	"valor_referencia" numeric(14, 2),
	"valor_unitario" numeric(14, 2),
	"subtotal" numeric(14, 2),
	"situacao_externa" varchar(120),
	"fase_externa" varchar(120),
	"dados_originais" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "importacao_bll_execucoes" ADD CONSTRAINT "importacao_bll_execucoes_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "importacao_bll_processos" ADD CONSTRAINT "importacao_bll_processos_ultima_execucao_id_importacao_bll_execucoes_id_fk" FOREIGN KEY ("ultima_execucao_id") REFERENCES "public"."importacao_bll_execucoes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "importacao_bll_itens" ADD CONSTRAINT "importacao_bll_itens_processo_importado_id_importacao_bll_processos_id_fk" FOREIGN KEY ("processo_importado_id") REFERENCES "public"."importacao_bll_processos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "importacao_bll_processos_origem_chave_uq" ON "importacao_bll_processos" USING btree ("origem","chave_externa");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_execucoes_origem_idx" ON "importacao_bll_execucoes" USING btree ("origem");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_execucoes_status_idx" ON "importacao_bll_execucoes" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_execucoes_iniciado_em_idx" ON "importacao_bll_execucoes" USING btree ("iniciado_em");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_execucoes_referencia_rotina_idx" ON "importacao_bll_execucoes" USING btree ("referencia_rotina");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_processos_numero_edital_idx" ON "importacao_bll_processos" USING btree ("numero_edital");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_processos_numero_adm_idx" ON "importacao_bll_processos" USING btree ("numero_administrativo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_processos_modalidade_idx" ON "importacao_bll_processos" USING btree ("modalidade");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_processos_publicacao_em_idx" ON "importacao_bll_processos" USING btree ("publicacao_em");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_processos_execucao_idx" ON "importacao_bll_processos" USING btree ("ultima_execucao_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_itens_processo_idx" ON "importacao_bll_itens" USING btree ("processo_importado_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_itens_lote_idx" ON "importacao_bll_itens" USING btree ("lote_numero");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "importacao_bll_itens_fornecedor_idx" ON "importacao_bll_itens" USING btree ("fornecedor_nome");
