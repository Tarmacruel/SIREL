ALTER TABLE etp
  ADD COLUMN IF NOT EXISTS metodologia_cotacao varchar(32) DEFAULT 'MEDIA' NOT NULL;

ALTER TABLE etp
  ALTER COLUMN descricao_necessidade DROP NOT NULL;

ALTER TABLE etp
  ALTER COLUMN analise_solucoes_mercado DROP NOT NULL;

ALTER TABLE etp
  ALTER COLUMN justificativa_tecnica DROP NOT NULL;

ALTER TABLE etp
  ALTER COLUMN conclusao_viabilidade DROP NOT NULL;

ALTER TABLE etp_cotacoes_preliminares
  ADD COLUMN IF NOT EXISTS considerada boolean DEFAULT true NOT NULL;

ALTER TABLE etp_cotacoes_preliminares
  ADD COLUMN IF NOT EXISTS motivo_desconsideracao varchar(32);

ALTER TABLE etp_cotacoes_preliminares
  ADD COLUMN IF NOT EXISTS justificativa_desconsideracao text;
