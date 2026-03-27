import { and, eq, ne } from "drizzle-orm";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), "..", ".env") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

import {
  auditoriaLog,
  authLog,
  licitacoes,
  licitantes,
  propostasLicitacao,
  lancesLicitacao,
  recursosLicitacao,
  documentos,
  contratos,
  contratoItens,
  aditivosContratos,
  notificacoesUsuario,
  notificacoesEnvios,
  notificacoesPreferencias,
  notificacoesPushSubscriptions,
  prazosAgendaCompartilhamentos,
  prazosProcessuais,
  tarefasEquipe,
  alertas,
  workflowProcesso,
  movimentacoesWorkflow,
  processos,
  importacaoBllExecucoes,
  importacaoBllItens,
  importacaoBllProcessos,
  parametrosSistema,
  departamentos,
  fornecedores,
  catalogoItens,
  pessoas,
  users,
  dfd,
  dfdResponsaveis,
  dfdSecretariasParticipantes,
  etp,
  tr,
  cotacoes,
  etpCotacoesPreliminares,
  lotes,
  itensProcesso,
} from "../db/schema.js";

async function main() {
  const { db } = await import("../db/client.js");
  if (!db) {
    throw new Error("Banco de dados não configurado.");
  }

  const [admin] = await db.select().from(users).where(eq(users.username, "jonatas.sousa")).limit(1);
  if (!admin) {
    throw new Error('Usuário administrador "jonatas.sousa" não encontrado. Reset abortado para evitar perda de acesso.');
  }

  await db.transaction(async (tx) => {
    await tx.delete(importacaoBllItens);
    await tx.delete(importacaoBllProcessos);
    await tx.delete(importacaoBllExecucoes);
    await tx.delete(authLog);
    await tx.delete(auditoriaLog);
    await tx.delete(prazosAgendaCompartilhamentos);
    await tx.delete(tarefasEquipe);
    await tx.delete(prazosProcessuais);
    await tx.delete(alertas);
    await tx.delete(notificacoesUsuario);
    await tx.delete(notificacoesEnvios);
    await tx.delete(notificacoesPreferencias);
    await tx.delete(notificacoesPushSubscriptions);
    await tx.delete(aditivosContratos);
    await tx.delete(contratoItens);
    await tx.delete(contratos);
    await tx.delete(documentos);
    await tx.delete(recursosLicitacao);
    await tx.delete(lancesLicitacao);
    await tx.delete(propostasLicitacao);
    await tx.delete(licitantes);
    await tx.delete(licitacoes);
    await tx.delete(cotacoes);
    await tx.delete(etpCotacoesPreliminares);
    await tx.delete(itensProcesso);
    await tx.delete(lotes);
    await tx.delete(tr);
    await tx.delete(etp);
    await tx.delete(dfdResponsaveis);
    await tx.delete(dfdSecretariasParticipantes);
    await tx.delete(dfd);
    await tx.delete(movimentacoesWorkflow);
    await tx.delete(workflowProcesso);
    await tx.delete(processos);
    await tx.delete(parametrosSistema);
    await tx.delete(departamentos);
    await tx.delete(fornecedores);
    await tx.delete(catalogoItens);
    await tx.delete(pessoas);
    await tx.delete(users).where(ne(users.username, "jonatas.sousa"));
    await tx
      .update(users)
      .set({
        ativo: true,
        updatedAt: new Date(),
      })
      .where(and(eq(users.username, "jonatas.sousa"), eq(users.id, admin.id)));
  });

  console.log('Base operacional zerada. Mantidos: secretarias, modalidades, status de processo e Usuário "jonatas.sousa".');
}

main().catch((error) => {
  console.error("Falha ao resetar a base de produção:", error);
  process.exit(1);
});
