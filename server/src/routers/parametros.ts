import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  parametroListInputSchema,
  parametroObterValorInputSchema,
  parametroUpdateInputSchema,
} from "@sirel/shared/schemas/parametros";

import { hasRole } from "../auth.js";
import { requireDb } from "../db/client.js";
import { parametrosHistorico, parametrosSistema } from "../db/schema.js";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../trpc.js";

function parseStoredValue(row: typeof parametrosSistema.$inferSelect) {
  if (row.valorJson !== null && row.valorJson !== undefined) {
    return row.valorJson;
  }

  const raw = String(row.valor ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function matchesTipoDado(value: unknown, tipoDado: (typeof parametrosSistema.$inferSelect)["tipoDado"]) {
  switch (tipoDado) {
    case "string":
    case "date":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

function resolveClientIp(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  if (!value) return null;
  return value.split(",")[0]?.trim() || null;
}

export const parametrosRouter = router({
  listar: protectedProcedure.input(parametroListInputSchema.optional()).query(async ({ ctx, input }) => {
    if (!hasRole(ctx, ["admin", "gestor", "auditor"])) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a gestores, auditores e administradores." });
    }

    const db = requireDb();
    const filters = [];
    const apenasAtivos = input?.apenasAtivos ?? true;

    if (apenasAtivos) filters.push(eq(parametrosSistema.ativo, true));
    if (input?.categoria) filters.push(eq(parametrosSistema.categoria, input.categoria));
    if (input?.busca) {
      filters.push(
        or(
          ilike(parametrosSistema.chave, `%${input.busca}%`),
          ilike(parametrosSistema.descricao, `%${input.busca}%`),
        ),
      );
    }

    const rows = await db
      .select()
      .from(parametrosSistema)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(parametrosSistema.categoria), asc(parametrosSistema.chave));

    return rows.map((row) => ({
      ...row,
      valor: ctx.user?.role === "auditor" ? null : parseStoredValue(row),
      valorPadrao: row.valorPadrao ?? null,
      podeEditar: ctx.user?.role === "admin",
    }));
  }),

  atualizar: adminProcedure.input(parametroUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [parametroAtual] = await db
      .select()
      .from(parametrosSistema)
      .where(and(eq(parametrosSistema.id, input.id), eq(parametrosSistema.ativo, true)))
      .limit(1);

    if (!parametroAtual) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Parâmetro não encontrado." });
    }

    if (!matchesTipoDado(input.valor, parametroAtual.tipoDado)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Valor incompatível com o tipo ${parametroAtual.tipoDado}.`,
      });
    }

    if (parametroAtual.requerReinicio && !input.justificativa?.trim()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Justificativa é obrigatória para parâmetros que exigem reinício.",
      });
    }

    const valorAnterior = parseStoredValue(parametroAtual);
    const [atualizado] = await db
      .update(parametrosSistema)
      .set({
        valor: JSON.stringify(input.valor),
        valorJson: input.valor,
        versao: (parametroAtual.versao ?? 1) + 1,
        alteradoPor: ctx.user!.id,
        justificativaAlteracao: input.justificativa?.trim() || null,
        atualizadoEm: new Date(),
      })
      .where(eq(parametrosSistema.id, input.id))
      .returning();

    const ipAddress =
      resolveClientIp(ctx.req.headers["x-forwarded-for"]) ??
      resolveClientIp(ctx.req.socket.remoteAddress) ??
      null;

    await db.insert(parametrosHistorico).values({
      parametroId: input.id,
      valorAnterior,
      valorNovo: input.valor,
      alteradoPor: ctx.user!.id,
      alteradoPorNome: ctx.user!.name,
      justificativa: input.justificativa?.trim() || null,
      ipOrigem: ipAddress,
      requerAprovacao: parametroAtual.requerReinicio,
    });

    return {
      success: true,
      parametro: {
        ...atualizado,
        valor: parseStoredValue(atualizado),
      },
      requerReinicio: parametroAtual.requerReinicio,
    };
  }),

  historico: protectedProcedure
    .input(parametroObterValorInputSchema)
    .query(async ({ ctx, input }) => {
      if (!hasRole(ctx, ["admin", "gestor", "auditor"])) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito." });
      }

      const db = requireDb();
      const [parametro] = await db
        .select({ id: parametrosSistema.id })
        .from(parametrosSistema)
        .where(eq(parametrosSistema.chave, input.chave.trim().toUpperCase()))
        .limit(1);
      if (!parametro) return [];

      return db
        .select()
        .from(parametrosHistorico)
        .where(eq(parametrosHistorico.parametroId, parametro.id))
        .orderBy(desc(parametrosHistorico.dataAlteracao))
        .limit(30);
    }),

  obterValor: publicProcedure.input(parametroObterValorInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const [parametro] = await db
      .select()
      .from(parametrosSistema)
      .where(
        and(
          eq(parametrosSistema.chave, input.chave.trim().toUpperCase()),
          eq(parametrosSistema.ativo, true),
        ),
      )
      .limit(1);

    if (!parametro) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Parâmetro não encontrado." });
    }

    return {
      id: parametro.id,
      chave: parametro.chave,
      categoria: parametro.categoria,
      tipoDado: parametro.tipoDado,
      versao: parametro.versao,
      valor: parseStoredValue(parametro),
    };
  }),
});
