ALTER TABLE licitacoes
  ADD COLUMN IF NOT EXISTS exige_declaracao_nao_fracionamento boolean NOT NULL DEFAULT false;

ALTER TABLE licitacoes
  ADD COLUMN IF NOT EXISTS publicar_no_dou boolean NOT NULL DEFAULT false;

ALTER TABLE licitacoes
  ADD COLUMN IF NOT EXISTS publicar_em_jornal boolean NOT NULL DEFAULT false;
