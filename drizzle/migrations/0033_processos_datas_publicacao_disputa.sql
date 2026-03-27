ALTER TABLE "processos"
  ADD COLUMN IF NOT EXISTS "data_publicacao" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "data_disputa_sessao" timestamp with time zone;
