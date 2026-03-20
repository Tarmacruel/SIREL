import { sql } from "drizzle-orm";

import type { db } from "./client.js";

const RESET_TABLES = [
  "importacao_bll_itens",
  "importacao_bll_processos",
  "importacao_bll_execucoes",
  "auth_log",
  "auditoria_log",
  "prazos_processuais",
  "alertas",
  "notificacoes_usuario",
  "aditivos_contratos",
  "contrato_itens",
  "contratos",
  "documentos",
  "recursos_licitacao",
  "lances_licitacao",
  "propostas_licitacao",
  "licitantes",
  "licitacoes",
  "cotacoes",
  "etp_cotacoes_preliminares",
  "itens_processo",
  "lotes",
  "tr",
  "etp",
  "dfd",
  "dfd_responsaveis",
  "dfd_secretarias_participantes",
  "movimentacoes_workflow",
  "workflow_processo",
  "processos",
  "parametros_historico",
  "parametros_sistema",
  "departamentos",
  "fornecedores",
  "catalogo_itens",
  "pessoas",
  "users",
  "status_processo",
  "modalidades",
  "secretarias",
];

type DatabaseInstance = NonNullable<typeof db>;

export async function resetBetaDatabase(database: DatabaseInstance) {
  await database.execute(sql.raw(`TRUNCATE TABLE ${RESET_TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}
