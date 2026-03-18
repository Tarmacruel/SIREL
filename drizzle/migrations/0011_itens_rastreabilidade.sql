ALTER TABLE itens_processo
  ADD COLUMN IF NOT EXISTS catalogo_item_id integer REFERENCES catalogo_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS itens_processo_catalogo_item_idx
  ON itens_processo(catalogo_item_id);

UPDATE itens_processo ip
SET catalogo_item_id = ci.id
FROM catalogo_itens ci
WHERE ip.catalogo_item_id IS NULL
  AND lower(trim(ip.descricao)) = lower(trim(ci.descricao))
  AND upper(trim(ip.unidade)) = upper(trim(ci.unidade_padrao));

CREATE TABLE IF NOT EXISTS contrato_itens (
  id serial PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  catalogo_item_id integer NOT NULL REFERENCES catalogo_itens(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  unidade varchar(32) NOT NULL,
  quantidade_contratada numeric(14, 3) NOT NULL,
  quantidade_consumida numeric(14, 3) NOT NULL DEFAULT 0,
  valor_unitario numeric(14, 2),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contrato_itens_contrato_idx
  ON contrato_itens(contrato_id);

CREATE INDEX IF NOT EXISTS contrato_itens_catalogo_item_idx
  ON contrato_itens(catalogo_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS contrato_itens_contrato_catalogo_uq
  ON contrato_itens(contrato_id, catalogo_item_id);
