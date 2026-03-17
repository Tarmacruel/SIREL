import { and, count, countDistinct, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { documentos, processos } from "../db/schema.js";
import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import { operadorProcedure, publicProcedure, router } from "../trpc.js";

const processoInput = z.object({ processoId: z.number().int().positive() });
const documentosListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  processoId: z.number().int().positive().optional(),
  search: z.string().trim().optional(),
  tipo: z.enum(["DFD", "ETP", "TR", "EDITAL", "COMUNICACAO_INTERNA", "RESULTADO", "CONTRATO", "OUTRO"]).optional(),
});

export const documentosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const [total] = await db.select({ total: count() }).from(documentos);
    const [processosComDocumentos] = await db.select({ total: countDistinct(documentos.processoId) }).from(documentos);
    const [ultimos] = await db.select({ total: count() }).from(documentos).where(eq(documentos.tipo, "EDITAL"));

    return {
      total: Number(total?.total ?? 0),
      processosComDocumentos: Number(processosComDocumentos?.total ?? 0),
      editais: Number(ultimos?.total ?? 0),
    };
  }),

  list: publicProcedure.input(documentosListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [];

    if (input.processoId) filters.push(eq(documentos.processoId, input.processoId));
    if (input.tipo) filters.push(eq(documentos.tipo, input.tipo));
    if (input.search) {
      filters.push(
        or(
          ilike(documentos.titulo, `%${input.search}%`),
          ilike(documentos.categoria, `%${input.search}%`),
          ilike(processos.numeroSirel, `%${input.search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const items = await db
      .select({
        id: documentos.id,
        processoId: documentos.processoId,
        processoNumeroSirel: processos.numeroSirel,
        titulo: documentos.titulo,
        descricao: documentos.descricao,
        tipo: documentos.tipo,
        categoria: documentos.categoria,
        versao: documentos.versao,
        arquivoUrl: documentos.arquivoUrl,
        criadoEm: documentos.criadoEm,
      })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(whereClause)
      .orderBy(desc(documentos.criadoEm), desc(documentos.id))
      .limit(input.pageSize)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(whereClause);

    return {
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total ?? 0),
      items,
    };
  }),

  listByProcesso: publicProcedure.input(processoInput).query(async ({ input }) => {
    const db = requireDb();
    return db.select().from(documentos).where(eq(documentos.processoId, input.processoId)).orderBy(desc(documentos.criadoEm));
  }),

  createVersion: operadorProcedure.input(z.object({
    processoId: z.number().int().positive(),
    titulo: z.string().min(3),
    tipo: z.enum(["DFD", "ETP", "TR", "EDITAL", "COMUNICACAO_INTERNA", "RESULTADO", "CONTRATO", "OUTRO"]),
    categoria: z.string().optional(),
    arquivoUrl: z.string().url().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const latest = await db.select().from(documentos).where(eq(documentos.processoId, input.processoId)).orderBy(desc(documentos.versao)).limit(1);
    const nextVersion = Number(latest[0]?.versao ?? 0) + 1;

    const [created] = await db.insert(documentos).values({
      processoId: input.processoId,
      titulo: input.titulo,
      tipo: input.tipo,
      categoria: input.categoria,
      versao: nextVersion,
      arquivoUrl: input.arquivoUrl,
      criadoPor: ctx.user?.id ?? null,
    }).returning();

    await logAuditoria(ctx, { tabela: "documentos", registroId: created.id, acao: "CREATE", dadosNovos: created, descricao: `Documento ${created.titulo} v${created.versao} criado` });

    return created;
  }),
});
