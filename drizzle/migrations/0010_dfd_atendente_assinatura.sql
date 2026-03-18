ALTER TABLE "dfd"
  ADD COLUMN IF NOT EXISTS "secretaria_demandante_id" integer REFERENCES "secretarias"("id"),
  ADD COLUMN IF NOT EXISTS "solicitante_pessoa_id" integer REFERENCES "pessoas"("id"),
  ADD COLUMN IF NOT EXISTS "assinatura_responsavel_id" integer REFERENCES "pessoas"("id");

UPDATE "dfd"
SET "secretaria_demandante_id" = COALESCE("secretaria_demandante_id", "secretaria_responsavel_id")
WHERE "secretaria_demandante_id" IS NULL;

UPDATE "dfd"
SET "assinatura_responsavel_id" = subquery."pessoa_id"
FROM (
  SELECT DISTINCT ON ("dfd_id") "dfd_id", "pessoa_id"
  FROM "dfd_responsaveis"
  ORDER BY "dfd_id", "id"
) AS subquery
WHERE "dfd"."id" = subquery."dfd_id"
  AND "dfd"."assinatura_responsavel_id" IS NULL;
