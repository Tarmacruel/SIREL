DO $$
BEGIN
  CREATE TYPE "parametro_tipo_dado" AS ENUM ('string', 'number', 'boolean', 'object', 'array', 'date');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "parametros_sistema"
ADD COLUMN IF NOT EXISTS "valor_json" jsonb,
ADD COLUMN IF NOT EXISTS "tipo_dado" "parametro_tipo_dado" NOT NULL DEFAULT 'string',
ADD COLUMN IF NOT EXISTS "valor_padrao" jsonb,
ADD COLUMN IF NOT EXISTS "requer_reinicio" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "versao" integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "alterado_por" integer,
ADD COLUMN IF NOT EXISTS "justificativa_alteracao" text;

CREATE TABLE IF NOT EXISTS "parametros_historico" (
  "id" serial PRIMARY KEY NOT NULL,
  "parametro_id" integer NOT NULL,
  "valor_anterior" jsonb,
  "valor_novo" jsonb NOT NULL,
  "alterado_por" integer,
  "alterado_por_nome" varchar(150) NOT NULL,
  "data_alteracao" timestamp with time zone DEFAULT now() NOT NULL,
  "justificativa" text,
  "ip_origem" varchar(45),
  "requer_aprovacao" boolean DEFAULT false NOT NULL,
  "aprovado_por" integer,
  "data_aprovacao" timestamp with time zone
);

DO $$
BEGIN
  ALTER TABLE "parametros_historico"
  ADD CONSTRAINT "parametros_historico_parametro_id_fkey"
  FOREIGN KEY ("parametro_id") REFERENCES "parametros_sistema"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "parametros_historico_parametro_idx" ON "parametros_historico" ("parametro_id");
CREATE INDEX IF NOT EXISTS "parametros_historico_data_alteracao_idx" ON "parametros_historico" ("data_alteracao");

INSERT INTO "parametros_sistema" ("categoria", "chave", "valor", "valor_json", "tipo_dado", "descricao", "valor_padrao", "requer_reinicio", "versao", "ativo", "criado_em", "atualizado_em")
VALUES
('REGRAS', 'LIMITES.DISPENSA.OUTROS_SERVICOS', '59908.94', '59908.94'::jsonb, 'number', 'Limite de dispensa para outros serviços/compras (Lei 14.133).', '59908.94'::jsonb, false, 1, true, now(), now()),
('REGRAS', 'LIMITES.DISPENSA.OBRAS_ENGENHARIA', '119217.89', '119217.89'::jsonb, 'number', 'Limite de dispensa para obras e engenharia (Lei 14.133).', '119217.89'::jsonb, false, 1, true, now(), now()),
('REGRAS', 'NUMERACAO.PROCESSOS', '{"formato":"SIREL-ANO-SEQUENCIAL","prefixo":"SIREL","sequencialReset":"anual","digitosSequencial":6}', '{"formato":"SIREL-ANO-SEQUENCIAL","prefixo":"SIREL","sequencialReset":"anual","digitosSequencial":6}'::jsonb, 'object', 'Configuração de numeração automática de processos.', '{"formato":"SIREL-ANO-SEQUENCIAL","prefixo":"SIREL","sequencialReset":"anual","digitosSequencial":6}'::jsonb, true, 1, true, now(), now()),
('REGRAS', 'PRAZOS.PREGAO.RECEBIMENTO_PROPOSTAS_DIAS_UTEIS', '8', '8'::jsonb, 'number', 'Prazo padrão de recebimento de propostas no pregão (dias úteis).', '8'::jsonb, false, 1, true, now(), now())
ON CONFLICT ("chave") DO NOTHING;
