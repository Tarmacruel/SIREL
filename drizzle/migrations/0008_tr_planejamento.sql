CREATE TABLE IF NOT EXISTS tr (
  id SERIAL PRIMARY KEY,
  processo_id INTEGER NOT NULL UNIQUE REFERENCES processos(id) ON DELETE CASCADE,
  objeto_termo TEXT NOT NULL,
  fundamentacao_contratacao TEXT NOT NULL,
  descricao_solucao TEXT NOT NULL,
  requisitos_contratacao TEXT NOT NULL,
  modelo_execucao TEXT,
  criterios_medicao_pagamento TEXT,
  adequacao_orcamentaria TEXT,
  observacoes TEXT,
  concluido BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
