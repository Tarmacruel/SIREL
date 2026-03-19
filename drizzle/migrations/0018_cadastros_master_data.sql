CREATE TABLE IF NOT EXISTS departamentos (
  id serial PRIMARY KEY,
  nome varchar(255) NOT NULL,
  codigo_centro_custo varchar(64),
  secretaria_id integer NOT NULL REFERENCES secretarias(id),
  responsavel_id integer REFERENCES pessoas(id),
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS departamentos_secretaria_idx ON departamentos(secretaria_id);
CREATE INDEX IF NOT EXISTS departamentos_ativo_idx ON departamentos(ativo);

CREATE TABLE IF NOT EXISTS parametros_sistema (
  id serial PRIMARY KEY,
  categoria varchar(120) NOT NULL,
  chave varchar(120) NOT NULL,
  valor text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS parametros_sistema_chave_uq ON parametros_sistema(chave);
CREATE INDEX IF NOT EXISTS parametros_sistema_categoria_idx ON parametros_sistema(categoria);
CREATE INDEX IF NOT EXISTS parametros_sistema_ativo_idx ON parametros_sistema(ativo);
