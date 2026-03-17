import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { documentos } from "../db/schema.js";
import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import { operadorProcedure, publicProcedure, router } from "../trpc.js";

const processoInput = z.object({ processoId: z.number().int().positive() });

export const documentosRouter = router({
  listByProcesso: publicProcedure.input(processoInput).query(async ({ input }) => {
    const db = requireDb();
    return db.select().from(documentos).where(eq(documentos.processoId, input.processoId)).orderBy(desc(documentos.criadoEm));
  }),

  createVersion: operadorProcedure.input(z.object({
    processoId: z.number().int().positive(),
    titulo: z.string().min(3),
    tipo: z.enum(["DFD", "ETP", "TR", "EDITAL", "COMUNICACAO_INTERNA", "RESULTADO", "CONTRATO", "OUTRO"]),
    categoria: z.string().optional(),
    arquivoUrl: z.string().url().optional()
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
      criadoPor: ctx.user?.id ?? null
    }).returning();

    await logAuditoria(ctx, { tabela: "documentos", registroId: created.id, acao: "CREATE", dadosNovos: created, descricao: `Documento ${created.titulo} v${created.versao} criado` });

    return created;
  })
});

