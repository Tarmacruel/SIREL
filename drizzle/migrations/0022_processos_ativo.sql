ALTER TABLE "processos"
ADD COLUMN IF NOT EXISTS "ativo" boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "processos_ativo_idx"
ON "processos" USING btree ("ativo");
