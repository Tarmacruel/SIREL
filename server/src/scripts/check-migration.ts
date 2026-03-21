import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { requireDb } from '../db/client.js';

// Load environment variables
const currentDir = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(currentDir, "../../../.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
];

for (const path of candidates) {
  if (!existsSync(path)) continue;
  config({ path });
  break;
}

async function checkColumn() {
  try {
    const db = requireDb();

    console.log('Verificando colunas da tabela importacao_bll_processos...');

    // Verificar se a tabela existe e quais colunas tem
    const result = await db.execute(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'importacao_bll_processos'
      ORDER BY ordinal_position
    `);

    console.log('Colunas encontradas:');
    result.rows.forEach((row: any) => {
      console.log(`  - ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    const justificativaExists = result.rows.some((row: any) => row.column_name === 'justificativa');
    console.log('\nColuna justificativa existe:', justificativaExists);

    if (!justificativaExists) {
      console.log('Aplicando migração manualmente...');
      await db.execute(`
        ALTER TABLE "importacao_bll_processos"
        ADD COLUMN IF NOT EXISTS "justificativa" text,
        ADD COLUMN IF NOT EXISTS "legislacao_aplicavel" varchar(255),
        ADD COLUMN IF NOT EXISTS "observacoes" text,
        ADD COLUMN IF NOT EXISTS "cota_me" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "codigo_pncp" varchar(100),
        ADD COLUMN IF NOT EXISTS "url_pncp" varchar(500),
        ADD COLUMN IF NOT EXISTS "data_sincronizacao_pncp" timestamp with time zone,
        ADD COLUMN IF NOT EXISTS "completeness_score" integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_validation_at" timestamp with time zone
      `);
      console.log('Migração aplicada com sucesso!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Erro:', error);
    process.exit(1);
  }
}

checkColumn();