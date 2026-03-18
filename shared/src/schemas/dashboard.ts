import { z } from "zod";

export const dashboardSummarySchema = z.object({
  processosAtivos: z.number().nonnegative(),
  contratosVigentes: z.number().nonnegative(),
  alertasPendentes: z.number().nonnegative(),
  valorGlobalEstimado: z.number().nonnegative(),
  porModulo: z.array(
    z.object({
      modulo: z.string(),
      total: z.number().nonnegative()
    })
  )
});

export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;
