import { and, asc, count, desc, eq, ilike, lte, or } from "drizzle-orm";
import { z } from "zod";

import { contratos, fornecedores, processos } from "../db/schema.js";
import { publicProcedure, router } from "../trpc.js";
import { requireDb } from "../db/client.js";

const contratosListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  status: z.enum(["ATIVO", "ENCERRADO", "SUSPENSO", "RESCINDIDO"]).optional(),
  search: z.string().trim().optional(),
});

export const contratosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const [ativos] = await db.select({ total: count() }).from(contratos).where(eq(contratos.status, "ATIVO"));
    const [total] = await db.select({ total: count() }).from(contratos);
    const [expirando] = await db
      .select({ total: count() })
      .from(contratos)
      .where(and(eq(contratos.status, "ATIVO"), lte(contratos.dataVigenciaFim, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))));

    return {
      total: Number(total?.total ?? 0),
      ativos: Number(ativos?.total ?? 0),
      expirandoEm30Dias: Number(expirando?.total ?? 0),
    };
  }),

  list: publicProcedure.input(contratosListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [];

    if (input.status) filters.push(eq(contratos.status, input.status));
    if (input.search) {
      filters.push(
        or(
          ilike(contratos.numeroContrato, `%${input.search}%`),
          ilike(contratos.objeto, `%${input.search}%`),
          ilike(processos.numeroSirel, `%${input.search}%`),
          ilike(fornecedores.razaoSocial, `%${input.search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const items = await db
      .select({
        id: contratos.id,
        numeroContrato: contratos.numeroContrato,
        processoNumeroSirel: processos.numeroSirel,
        fornecedor: fornecedores.razaoSocial,
        valorContrato: contratos.valorContrato,
        dataVigenciaInicio: contratos.dataVigenciaInicio,
        dataVigenciaFim: contratos.dataVigenciaFim,
        status: contratos.status,
        objeto: contratos.objeto,
      })
      .from(contratos)
      .innerJoin(processos, eq(processos.id, contratos.processoId))
      .innerJoin(fornecedores, eq(fornecedores.id, contratos.fornecedorId))
      .where(whereClause)
      .orderBy(asc(contratos.dataVigenciaFim), desc(contratos.criadoEm))
      .limit(input.pageSize)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(contratos)
      .innerJoin(processos, eq(processos.id, contratos.processoId))
      .innerJoin(fornecedores, eq(fornecedores.id, contratos.fornecedorId))
      .where(whereClause);

    return {
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total ?? 0),
      items,
    };
  }),

  listVigentes: publicProcedure.query(async () => {
    const db = requireDb();
    return db.select().from(contratos).where(eq(contratos.status, "ATIVO")).orderBy(asc(contratos.dataVigenciaFim));
  }),

  expirando: publicProcedure.input(z.object({ ate: z.string() })).query(async ({ input }) => {
    const db = requireDb();
    return db.select().from(contratos).where(lte(contratos.dataVigenciaFim, input.ate)).orderBy(asc(contratos.dataVigenciaFim));
  }),
});
