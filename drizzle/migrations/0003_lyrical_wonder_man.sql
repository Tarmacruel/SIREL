CREATE TABLE "dfd" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"setor_demandante" varchar(255) NOT NULL,
	"necessidade_contratacao" text NOT NULL,
	"justificativa" text NOT NULL,
	"resultados_pretendidos" text NOT NULL,
	"observacoes" text,
	"responsavel_id" integer,
	"concluido" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dfd_processo_id_unique" UNIQUE("processo_id")
);
--> statement-breakpoint
ALTER TABLE "dfd" ADD CONSTRAINT "dfd_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dfd" ADD CONSTRAINT "dfd_responsavel_id_pessoas_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;