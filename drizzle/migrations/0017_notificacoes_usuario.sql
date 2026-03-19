DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificacao_tipo') THEN
    CREATE TYPE notificacao_tipo AS ENUM ('PRAZO', 'MOVIMENTACAO', 'DOCUMENTO', 'SISTEMA');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificacao_prioridade') THEN
    CREATE TYPE notificacao_prioridade AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notificacoes_usuario (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  processo_id integer REFERENCES processos(id) ON DELETE CASCADE,
  documento_id integer REFERENCES documentos(id) ON DELETE CASCADE,
  prazo_id integer REFERENCES prazos_processuais(id) ON DELETE CASCADE,
  tipo notificacao_tipo NOT NULL DEFAULT 'SISTEMA',
  prioridade notificacao_prioridade NOT NULL DEFAULT 'BAIXA',
  chave varchar(255) NOT NULL,
  titulo varchar(255) NOT NULL,
  mensagem text NOT NULL,
  href varchar(255),
  acao_relacionada jsonb,
  origem_automatica boolean NOT NULL DEFAULT true,
  lida boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  data_expiracao timestamptz
);

CREATE INDEX IF NOT EXISTS notificacoes_usuario_user_idx ON notificacoes_usuario (user_id);
CREATE INDEX IF NOT EXISTS notificacoes_usuario_lida_idx ON notificacoes_usuario (lida);
CREATE INDEX IF NOT EXISTS notificacoes_usuario_expiracao_idx ON notificacoes_usuario (data_expiracao);
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_usuario_user_chave_uq ON notificacoes_usuario (user_id, chave);
