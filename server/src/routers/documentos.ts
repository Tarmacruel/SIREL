import { and, asc, count, countDistinct, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  documentoDetailInputSchema,
  documentoListInputSchema,
  documentoMetadataInputSchema,
  documentoTipoOptions,
} from "@sirel/shared/schemas/documentos";

import { documentos, processos } from "../db/schema.js";
import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import { operadorProcedure, publicProcedure, router } from "../trpc.js";

const processoInput = z.object({ processoId: z.number().int().positive() });

function normalizeKeywords(values: string[] | null | undefined) {
  return Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
}

function buildDocumentoUrl(documentoId: number) {
  return `/api/planejamento/documentos/${documentoId}/download`;
}

export const documentosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const [total] = await db.select({ total: count() }).from(documentos);
    const [processosComDocumentos] = await db.select({ total: countDistinct(documentos.processoId) }).from(documentos);
    const [publicos] = await db.select({ total: count() }).from(documentos).where(eq(documentos.publico, true));
    const [semMetadados] = await db
      .select({ total: count() })
      .from(documentos)
      .where(sql`${documentos.dataReferencia} IS NULL AND coalesce(jsonb_array_length(${documentos.palavrasChave}), 0) = 0`);

    return {
      total: Number(total?.total ?? 0),
      processosComDocumentos: Number(processosComDocumentos?.total ?? 0),
      publicos: Number(publicos?.total ?? 0),
      semMetadados: Number(semMetadados?.total ?? 0),
    };
  }),

  list: publicProcedure.input(documentoListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [];

    if (input.processoId) filters.push(eq(documentos.processoId, input.processoId));
    if (input.tipo) filters.push(eq(documentos.tipo, input.tipo));
    if (input.categoria) filters.push(ilike(documentos.categoria, `%${input.categoria}%`));
    if (typeof input.publico === "boolean") filters.push(eq(documentos.publico, input.publico));
    if (input.dataInicial) filters.push(sql`${documentos.dataReferencia} >= ${input.dataInicial}`);
    if (input.dataFinal) filters.push(sql`${documentos.dataReferencia} <= ${input.dataFinal}`);
    if (input.search) {
      const pattern = `%${input.search}%`;
      filters.push(
        or(
          ilike(documentos.titulo, pattern),
          ilike(documentos.descricao, pattern),
          ilike(documentos.categoria, pattern),
          ilike(processos.numeroSirel, pattern),
          sql`coalesce(${documentos.palavrasChave}::text, '') ilike ${pattern}`,
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
        mimeType: documentos.mimeType,
        dataReferencia: documentos.dataReferencia,
        publico: documentos.publico,
        palavrasChave: documentos.palavrasChave,
        criadoEm: documentos.criadoEm,
        atualizadoEm: documentos.atualizadoEm,
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
      items: items.map((item) => ({
        ...item,
        arquivoUrl: buildDocumentoUrl(item.id),
        palavrasChave: normalizeKeywords(item.palavrasChave as string[] | null | undefined),
      })),
    };
  }),

  processOptions: publicProcedure.query(async () => {
    const db = requireDb();
    return db
      .select({ id: processos.id, numeroSirel: processos.numeroSirel, objeto: processos.objeto })
      .from(processos)
      .orderBy(desc(processos.criadoEm), desc(processos.id))
      .limit(300);
  }),

  detail: publicProcedure.input(documentoDetailInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const [documento] = await db
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
        arquivoChave: documentos.arquivoChave,
        mimeType: documentos.mimeType,
        dataReferencia: documentos.dataReferencia,
        palavrasChave: documentos.palavrasChave,
        publico: documentos.publico,
        restritoA: documentos.restritoA,
        criadoPor: documentos.criadoPor,
        criadoEm: documentos.criadoEm,
        atualizadoEm: documentos.atualizadoEm,
      })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(eq(documentos.id, input.documentoId))
      .limit(1);

    if (!documento) return null;

    const related = await db
      .select({
        id: documentos.id,
        titulo: documentos.titulo,
        versao: documentos.versao,
        criadoEm: documentos.criadoEm,
        arquivoUrl: documentos.arquivoUrl,
      })
      .from(documentos)
      .where(and(eq(documentos.processoId, documento.processoId), eq(documentos.tipo, documento.tipo)))
      .orderBy(desc(documentos.versao), desc(documentos.criadoEm))
      .limit(12);

    return {
      ...documento,
      arquivoUrl: buildDocumentoUrl(documento.id),
      palavrasChave: normalizeKeywords(documento.palavrasChave as string[] | null | undefined),
      restritoA: normalizeKeywords(documento.restritoA as string[] | null | undefined),
      related: related.map((item) => ({ ...item, arquivoUrl: buildDocumentoUrl(item.id) })),
    };
  }),

  updateMetadata: operadorProcedure.input(documentoMetadataInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [before] = await db.select().from(documentos).where(eq(documentos.id, input.documentoId)).limit(1);
    if (!before) {
      throw new Error("Documento não encontrado.");
    }

    const [updated] = await db
      .update(documentos)
      .set({
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        categoria: input.categoria?.trim() || null,
        dataReferencia: input.dataReferencia || null,
        palavrasChave: normalizeKeywords(input.palavrasChave),
        publico: input.publico,
        restritoA: normalizeKeywords(input.restritoA),
        atualizadoEm: new Date(),
      })
      .where(eq(documentos.id, input.documentoId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "documentos",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: before,
      dadosNovos: updated,
      descricao: `Metadados do documento ${updated.titulo} atualizados`,
    });

    return updated;
  }),

  listByProcesso: publicProcedure.input(processoInput).query(async ({ input }) => {
    const db = requireDb();
    const rows = await db
      .select()
      .from(documentos)
      .where(eq(documentos.processoId, input.processoId))
      .orderBy(asc(documentos.criadoEm), asc(documentos.id));
    return rows.map((row) => ({
      ...row,
      arquivoUrl: buildDocumentoUrl(row.id),
      palavrasChave: normalizeKeywords(row.palavrasChave as string[] | null | undefined),
    }));
  }),

  createVersion: operadorProcedure.input(z.object({
    processoId: z.number().int().positive(),
    titulo: z.string().min(3),
    tipo: z.enum(documentoTipoOptions),
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
      publico: false,
      palavrasChave: [],
      restritoA: [],
    }).returning();

    await logAuditoria(ctx, { tabela: "documentos", registroId: created.id, acao: "CREATE", dadosNovos: created, descricao: `Documento ${created.titulo} v${created.versao} criado` });

    return created;
  }),
});

