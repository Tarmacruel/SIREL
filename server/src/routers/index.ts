import { router } from "../trpc.js";
import { auditoriaRouter } from "./auditoria.js";
import { authRouter } from "./auth.js";
import { cadastrosRouter } from "./cadastros.js";
import { consultasRouter } from "./consultas.js";
import { contratosRouter } from "./contratos.js";
import { dashboardRouter } from "./dashboard.js";
import { documentosRouter } from "./documentos.js";
import { healthRouter } from "./health.js";
import { importacoesRouter } from "./importacoes.js";
import { itensRouter } from "./itens.js";
import { licitacaoRouter } from "./licitacao.js";
import { notificacoesRouter } from "./notificacoes.js";
import { parametrosRouter } from "./parametros.js";
import { planejamentoRouter } from "./planejamento.js";
import { prazosRouter } from "./prazos.js";
import { processosRouter } from "./processos.js";
import { relatoriosRouter } from "./relatorios.js";
import { usuariosRouter } from "./usuarios.js";
import { workflowRouter } from "./workflow.js";
import { pncpTeixeiraRouter } from "./importacoes-pncp-teixeira.js";

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  auditoria: auditoriaRouter,
  dashboard: dashboardRouter,
  cadastros: cadastrosRouter,
  consultas: consultasRouter,
  importacoes: importacoesRouter,
  pncpTeixeira: pncpTeixeiraRouter,
  itens: itensRouter,
  licitacao: licitacaoRouter,
  notificacoes: notificacoesRouter,
  parametros: parametrosRouter,
  planejamento: planejamentoRouter,
  prazos: prazosRouter,
  processos: processosRouter,
  relatorios: relatoriosRouter,
  documentos: documentosRouter,
  contratos: contratosRouter,
  workflow: workflowRouter,
  usuarios: usuariosRouter,
});

export type AppRouter = typeof appRouter;
