ALTER TABLE catalogo_itens ADD COLUMN IF NOT EXISTS imagem_url varchar(255);
ALTER TABLE catalogo_itens ADD COLUMN IF NOT EXISTS imagem_chave varchar(255);

ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS logo_url varchar(255);
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS logo_chave varchar(255);
