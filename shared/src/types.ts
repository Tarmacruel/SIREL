import { workflowModuleOptions, workflowSituacaoOptions } from "./const.js";

export type UserRole = "user" | "admin" | "gestor" | "operador" | "auditor";

export type WorkflowModule = (typeof workflowModuleOptions)[number];
export type WorkflowSituacao = (typeof workflowSituacaoOptions)[number];

export interface DashboardSummary {
  processosAtivos: number;
  contratosVigentes: number;
  alertasPendentes: number;
  valorGlobalEstimado: number;
  porModulo: Array<{ modulo: WorkflowModule; total: number }>;
}
