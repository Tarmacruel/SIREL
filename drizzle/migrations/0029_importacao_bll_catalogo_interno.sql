DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'importacao_bll_itens_especificados'
      AND column_name = 'catalogoInterno_id'
  ) THEN
    EXECUTE 'ALTER TABLE importacao_bll_itens_especificados RENAME COLUMN "catalogoInterno_id" TO catalogo_interno_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'importacao_bll_itens_especificados'
      AND column_name = 'catalogo_interno_id'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS importacao_bll_itens_catalogo_idx';
    EXECUTE 'CREATE INDEX IF NOT EXISTS importacao_bll_itens_catalogo_idx ON importacao_bll_itens_especificados (catalogo_interno_id)';
  END IF;
END
$$;
