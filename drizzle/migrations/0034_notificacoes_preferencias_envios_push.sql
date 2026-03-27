DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificacao_frequencia') THEN
    CREATE TYPE notificacao_frequencia AS ENUM ('IMEDIATA', 'RESUMO_DIARIO', 'RESUMO_SEMANAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificacao_escopo') THEN
    CREATE TYPE notificacao_escopo AS ENUM ('MEUS_ITENS', 'EQUIPE', 'CRITICOS');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificacao_canal') THEN
    CREATE TYPE notificacao_canal AS ENUM ('IN_APP', 'EMAIL', 'PUSH');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificacao_envio_status') THEN
    CREATE TYPE notificacao_envio_status AS ENUM ('ENVIADO', 'FALHA', 'IGNORADO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notificacoes_preferencias (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frequencia notificacao_frequencia NOT NULL DEFAULT 'IMEDIATA',
  escopo notificacao_escopo NOT NULL DEFAULT 'MEUS_ITENS',
  canal_in_app boolean NOT NULL DEFAULT true,
  canal_email boolean NOT NULL DEFAULT false,
  canal_push boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_preferencias_user_uq ON notificacoes_preferencias (user_id);

CREATE TABLE IF NOT EXISTS notificacoes_push_subscriptions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh varchar(255) NOT NULL,
  auth varchar(255) NOT NULL,
  expiration_time timestamptz,
  user_agent varchar(255),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_push_user_endpoint_uq ON notificacoes_push_subscriptions (user_id, endpoint);
CREATE INDEX IF NOT EXISTS notificacoes_push_user_idx ON notificacoes_push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS notificacoes_envios (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chave varchar(255) NOT NULL,
  canal notificacao_canal NOT NULL,
  status notificacao_envio_status NOT NULL DEFAULT 'ENVIADO',
  destino varchar(255),
  erro text,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_envio_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_envios_user_chave_uq ON notificacoes_envios (user_id, chave, canal);
CREATE INDEX IF NOT EXISTS notificacoes_envios_user_idx ON notificacoes_envios (user_id);
CREATE INDEX IF NOT EXISTS notificacoes_envios_status_idx ON notificacoes_envios (status);
