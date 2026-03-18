import { count, eq, sum } from "drizzle-orm";

import { alertas, contratos, processos, workflowProcesso } from "../db/schema.js";
import { requireDb } from "../db/client.js";
import { publicProcedure, router } from "../trpc.js";

export const dashboardRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();

    const [processosAtivosRow] = await db.select({ total: count() }).from(processos).where(eq(processos.finalizado, false));
    const [contratosVigentesRow] = await db.select({ total: count() }).from(contratos).where(eq(contratos.status, "ATIVO"));
    const [alertasPendentesRow] = await db.select({ total: count() }).from(alertas).where(eq(alertas.lido, false));
    const [valorGlobalEstimadoRow] = await db.select({ total: sum(processos.valorEstimado) }).from(processos);
    const porModulo = await db.select({ modulo: workflowProcesso.moduloAtual, total: count() }).from(workflowProcesso).groupBy(workflowProcesso.moduloAtual);

    return {
      processosAtivos: Number(processosAtivosRow?.total ?? 0),
      contratosVigentes: Number(contratosVigentesRow?.total ?? 0),
      alertasPendentes: Number(alertasPendentesRow?.total ?? 0),
      valorGlobalEstimado: Number(valorGlobalEstimadoRow?.total ?? 0),
      porModulo: porModulo.map((row) => ({ modulo: row.modulo, total: Number(row.total) }))
    };
  })
});

