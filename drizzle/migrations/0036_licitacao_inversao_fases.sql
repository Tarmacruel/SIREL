ALTER TABLE "licitacoes" ADD COLUMN "inversao_fases_habilitada" boolean DEFAULT false NOT NULL;
ALTER TABLE "licitacoes" ADD COLUMN "inversao_fases_justificativa" text;
