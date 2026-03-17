import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { cadastrosRouter } from "./cadastros.js";
import { contratosRouter } from "./contratos.js";
import { dashboardRouter } from "./dashboard.js";
import { documentosRouter } from "./documentos.js";
import { healthRouter } from "./health.js";
import { planejamentoRouter } from "./planejamento.js";
import { processosRouter } from "./processos.js";
import { usuariosRouter } from "./usuarios.js";
import { workflowRouter } from "./workflow.js";

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  dashboard: dashboardRouter,
  cadastros: cadastrosRouter,
  planejamento: planejamentoRouter,
  processos: processosRouter,
  documentos: documentosRouter,
  contratos: contratosRouter,
  workflow: workflowRouter,
  usuarios: usuariosRouter
});

export type AppRouter = typeof appRouter;
