DO $$ BEGIN
  CREATE TYPE licitacao_status AS ENUM (
    'PREPARACAO',
    'PUBLICACAO',
    'RECEBIMENTO_PROPOSTAS',
    'ABERTURA_PROPOSTAS',
    'LANCES',
    'JULGAMENTO',
    'HABILITACAO',
    'RECURSOS',
    'HOMOLOGACAO',
    'CONTRATACAO',
    'FRACASSADA',
    'CANCELADA'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE habilitacao_status AS ENUM ('PENDENTE', 'HABILITADO', 'INABILITADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE proposta_situacao AS ENUM ('VALIDA', 'DESCLASSIFICADA', 'VENCEDORA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recurso_resultado AS ENUM ('PENDENTE', 'PROVIDO', 'IMPROVIDO', 'PARCIALMENTE_PROVIDO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS licitacoes (
  id SERIAL PRIMARY KEY,
  processo_id INTEGER NOT NULL UNIQUE REFERENCES processos(id) ON DELETE CASCADE,
  status_licitacao licitacao_status NOT NULL DEFAULT 'PREPARACAO',
  data_publicacao_edital TIMESTAMPTZ,
  data_recebimento_propostas_inicio TIMESTAMPTZ,
  data_recebimento_propostas_fim TIMESTAMPTZ,
  data_abertura_propostas TIMESTAMPTZ,
  data_inicio_lances TIMESTAMPTZ,
  data_fim_lances TIMESTAMPTZ,
  data_julgamento TIMESTAMPTZ,
  data_homologacao TIMESTAMPTZ,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS licitacoes_status_idx ON licitacoes(status_licitacao);

CREATE TABLE IF NOT EXISTS licitantes (
  id SERIAL PRIMARY KEY,
  licitacao_id INTEGER NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  data_cadastro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_habilitacao habilitacao_status NOT NULL DEFAULT 'PENDENTE',
  observacao_habilitacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS licitantes_licitacao_idx ON licitantes(licitacao_id);
CREATE INDEX IF NOT EXISTS licitantes_fornecedor_idx ON licitantes(fornecedor_id);
CREATE UNIQUE INDEX IF NOT EXISTS licitantes_licitacao_fornecedor_uq ON licitantes(licitacao_id, fornecedor_id);

CREATE TABLE IF NOT EXISTS propostas_licitacao (
  id SERIAL PRIMARY KEY,
  licitante_id INTEGER NOT NULL REFERENCES licitantes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES itens_processo(id) ON DELETE CASCADE,
  valor_unitario_proposto NUMERIC(14,2) NOT NULL,
  valor_total_proposto NUMERIC(14,2) NOT NULL,
  data_proposta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classificacao INTEGER,
  situacao proposta_situacao NOT NULL DEFAULT 'VALIDA',
  justificativa TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS propostas_licitacao_licitante_idx ON propostas_licitacao(licitante_id);
CREATE INDEX IF NOT EXISTS propostas_licitacao_item_idx ON propostas_licitacao(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS propostas_licitacao_licitante_item_uq ON propostas_licitacao(licitante_id, item_id);

CREATE TABLE IF NOT EXISTS lances_licitacao (
  id SERIAL PRIMARY KEY,
  proposta_id INTEGER NOT NULL REFERENCES propostas_licitacao(id) ON DELETE CASCADE,
  valor_lance NUMERIC(14,2) NOT NULL,
  data_lance TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id INTEGER REFERENCES users(id),
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS lances_licitacao_proposta_idx ON lances_licitacao(proposta_id);
CREATE INDEX IF NOT EXISTS lances_licitacao_usuario_idx ON lances_licitacao(usuario_id);

CREATE TABLE IF NOT EXISTS recursos_licitacao (
  id SERIAL PRIMARY KEY,
  licitacao_id INTEGER NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  licitante_id INTEGER NOT NULL REFERENCES licitantes(id) ON DELETE CASCADE,
  data_interposicao DATE NOT NULL,
  data_julgamento DATE,
  resultado recurso_resultado NOT NULL DEFAULT 'PENDENTE',
  descricao TEXT NOT NULL,
  decisao TEXT,
  criado_por INTEGER REFERENCES users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recursos_licitacao_licitacao_idx ON recursos_licitacao(licitacao_id);
CREATE INDEX IF NOT EXISTS recursos_licitacao_licitante_idx ON recursos_licitacao(licitante_id);
