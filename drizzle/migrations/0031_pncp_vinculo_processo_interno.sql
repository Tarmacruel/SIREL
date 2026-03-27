ALTER TABLE "importacao_pncp_contratacoes"
ADD COLUMN IF NOT EXISTS "processo_interno_id" integer;

ALTER TABLE "importacao_pncp_atas"
ADD COLUMN IF NOT EXISTS "processo_interno_id" integer;

ALTER TABLE "importacao_pncp_contratos"
ADD COLUMN IF NOT EXISTS "processo_interno_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'importacao_pncp_contratacoes_processo_interno_id_processos_id_fk'
  ) THEN
    ALTER TABLE "importacao_pncp_contratacoes"
      ADD CONSTRAINT "importacao_pncp_contratacoes_processo_interno_id_processos_id_fk"
      FOREIGN KEY ("processo_interno_id")
      REFERENCES "public"."processos"("id")
      ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'importacao_pncp_atas_processo_interno_id_processos_id_fk'
  ) THEN
    ALTER TABLE "importacao_pncp_atas"
      ADD CONSTRAINT "importacao_pncp_atas_processo_interno_id_processos_id_fk"
      FOREIGN KEY ("processo_interno_id")
      REFERENCES "public"."processos"("id")
      ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'importacao_pncp_contratos_processo_interno_id_processos_id_fk'
  ) THEN
    ALTER TABLE "importacao_pncp_contratos"
      ADD CONSTRAINT "importacao_pncp_contratos_processo_interno_id_processos_id_fk"
      FOREIGN KEY ("processo_interno_id")
      REFERENCES "public"."processos"("id")
      ON DELETE set null;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "importacao_pncp_contratacoes_processo_interno_idx"
ON "importacao_pncp_contratacoes" USING btree ("processo_interno_id");

CREATE INDEX IF NOT EXISTS "importacao_pncp_atas_processo_interno_idx"
ON "importacao_pncp_atas" USING btree ("processo_interno_id");

CREATE INDEX IF NOT EXISTS "importacao_pncp_contratos_processo_interno_idx"
ON "importacao_pncp_contratos" USING btree ("processo_interno_id");
