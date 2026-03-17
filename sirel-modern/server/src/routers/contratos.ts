import { asc, eq, lte } from "drizzle-orm";
import { z } from "zod";

import { contratos } from "../db/schema.js";
import { publicProcedure, router } from "../trpc.js";
import { requireDb } from "../db/client.js";

export const contratosRouter = router({
  listVigentes: publicProcedure.query(async () => {
    const db = requireDb();
    return db.select().from(contratos).where(eq(contratos.status, "ATIVO")).orderBy(asc(contratos.dataVigenciaFim));
  }),

  expirando: publicProcedure.input(z.object({ ate: z.string() })).query(async ({ input }) => {
    const db = requireDb();
    return db.select().from(contratos).where(lte(contratos.dataVigenciaFim, input.ate)).orderBy(asc(contratos.dataVigenciaFim));
  })
});

