import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import {
  prazoConcluirInputSchema,
  prazoDeleteInputSchema,
  prazoListInputSchema,
  prazoSaveInputSchema,
} from "@sirel/shared/schemas/prazos";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import { processos, prazosProcessuais, secretarias } from "../db/schema.js";
import { operadorProcedure, publicProcedure, router } from "../trpc.js";

type PrazoProcessualInsert = typeof prazosProcessuais.$inferInsert;

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function diffInDays(target: Date) {
  const today = startOfDay();
  return Math.round((startOfDay(target).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function resolvePrazoStatus(row: { status: string; dataPrevista: Date; dataRealizada: Date | null }) {
  if (row.dataRealizada || row.status === "CONCLUIDO") return "CONCLUIDO";
  return row.dataPrevista < startOfDay() ? "EM_ATRASO" : "PENDENTE";
}

function buildPrazoView(row: any) {
  const status = resolvePrazoStatus(row);
  const dataPrevista = row.dataPrevista instanceof Date ? row.dataPrevista : new Date(row.dataPrevista);
  const daysRemaining = status === "CONCLUIDO" ? null : diffInDays(dataPrevista);
  const alertLevel =
    status === "EM_ATRASO"
      ? "error"
      : daysRemaining === 0
        ? "critical"
        : daysRemaining !== null && daysRemaining <= 2
          ? "warning"
          : daysRemaining !== null && daysRemaining <= 7
            ? "info"
            : "normal";

  return {
    ...row,
    status,
    daysRemaining,
    alertLevel,
  };
}

export const prazosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const rows = await db
      .select({
        id: prazosProcessuais.id,
        titulo: prazosProcessuais.titulo,
        tipo: prazosProcessuais.tipo,
        dataPrevista: prazosProcessuais.dataPrevista,
        dataRealizada: prazosProcessuais.dataRealizada,
        status: prazosProcessuais.status,
        processoId: prazosProcessuais.processoId,
        numeroSirel: processos.numeroSirel,
      })
      .from(prazosProcessuais)
      .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
      .orderBy(asc(prazosProcessuais.dataPrevista));

    const parsed = rows.map(buildPrazoView);
    const today = parsed.filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining === 0);
    const next48h = parsed.filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 2);
    const overdue = parsed.filter((item) => item.status === "EM_ATRASO");
    const thisWeek = parsed.filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 7);
    const completedWeek = parsed.filter((item) => item.status === "CONCLUIDO" && item.dataRealizada && new Date(item.dataRealizada) >= startOfDay(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

    const alerts = parsed
      .filter((item) => item.status !== "CONCLUIDO" && item.daysRemaining !== null && item.daysRemaining <= 7)
      .sort((left, right) => {
        const leftWeight = left.status === "EM_ATRASO" ? -100 : left.daysRemaining ?? 999;
        const rightWeight = right.status === "EM_ATRASO" ? -100 : right.daysRemaining ?? 999;
        return leftWeight - rightWeight;
      })
      .slice(0, 8);

    return {
      total: parsed.length,
      hoje: today.length,
      proximas48h: next48h.length,
      atrasados: overdue.length,
      semana: thisWeek.length,
      concluidosSemana: completedWeek.length,
      alerts,
    };
  }),

  list: publicProcedure.input(prazoListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [];

    if (input.processoId) filters.push(eq(prazosProcessuais.processoId, input.processoId));
    if (input.tipo) filters.push(eq(prazosProcessuais.tipo, input.tipo as never));
    if (input.status === "CONCLUIDO") {
      filters.push(eq(prazosProcessuais.status, "CONCLUIDO"));
    }
    if (input.busca) {
      const pattern = `%${input.busca}%`;
      filters.push(
        or(
          ilike(prazosProcessuais.titulo, pattern),
          ilike(processos.numeroSirel, pattern),
          ilike(processos.objeto, pattern),
          ilike(secretarias.nome, pattern),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({
        id: prazosProcessuais.id,
        processoId: prazosProcessuais.processoId,
        tipo: prazosProcessuais.tipo,
        titulo: prazosProcessuais.titulo,
        dataPrevista: prazosProcessuais.dataPrevista,
        dataRealizada: prazosProcessuais.dataRealizada,
        status: prazosProcessuais.status,
        observacao: prazosProcessuais.observacao,
        alertasConfig: prazosProcessuais.alertasConfig,
        criadoEm: prazosProcessuais.criadoEm,
        atualizadoEm: prazosProcessuais.atualizadoEm,
        numeroSirel: processos.numeroSirel,
        objeto: processos.objeto,
        secretariaNome: secretarias.nome,
      })
      .from(prazosProcessuais)
      .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .where(whereClause)
      .orderBy(asc(prazosProcessuais.dataPrevista), asc(prazosProcessuais.id));

    let items = rows.map(buildPrazoView);
    if (input.status && input.status !== "CONCLUIDO") {
      items = items.filter((item) => item.status === input.status);
    }
    if (input.somenteCriticos) {
      items = items.filter((item) => item.status === "EM_ATRASO" || (item.daysRemaining !== null && item.daysRemaining <= 2));
    }

    const total = items.length;
    const offset = (input.pagina - 1) * input.limite;
    items = items.slice(offset, offset + input.limite);

    return {
      pagina: input.pagina,
      limite: input.limite,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limite)),
      items,
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

  save: operadorProcedure.input(prazoSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const dataPrevista = toDateOnly(input.dataPrevista);
    const status: PrazoProcessualInsert["status"] =
      new Date(`${dataPrevista}T00:00:00`) < startOfDay() ? "EM_ATRASO" : "PENDENTE";
    const payload: PrazoProcessualInsert = {
      processoId: input.processoId,
      tipo: input.tipo,
      titulo: input.titulo.trim(),
      dataPrevista,
      status,
      observacao: input.observacao?.trim() || null,
      alertasConfig: { lembretes: Array.from(new Set(input.lembretes)).sort((a, b) => b - a), canais: ["sistema"] },
      atualizadoEm: new Date(),
    };

    if (input.prazoId) {
      const [updated] = await db
        .update(prazosProcessuais)
        .set(payload)
        .where(eq(prazosProcessuais.id, input.prazoId))
        .returning();

      if (!updated) {
        throw new Error("Prazo não encontrado.");
      }

      await logAuditoria(ctx, {
        tabela: "prazos_processuais",
        registroId: updated.id,
        acao: "UPDATE",
        dadosNovos: updated,
        descricao: `Prazo ${updated.titulo} atualizado`,
      });

      return updated;
    }

    const [created] = await db
      .insert(prazosProcessuais)
      .values({
        ...payload,
        criadoPor: ctx.user?.id ?? null,
        criadoEm: new Date(),
      })
      .returning();

    await logAuditoria(ctx, {
      tabela: "prazos_processuais",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: created,
      descricao: `Prazo ${created.titulo} criado`,
    });

    return created;
  }),

  conclude: operadorProcedure.input(prazoConcluirInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [updated] = await db
      .update(prazosProcessuais)
      .set({
        dataRealizada: input.dataRealizada ? toDateOnly(input.dataRealizada) : new Date().toISOString().slice(0, 10),
        status: "CONCLUIDO",
        observacao: input.observacaoConclusao?.trim() || undefined,
        atualizadoEm: new Date(),
      })
      .where(eq(prazosProcessuais.id, input.prazoId))
      .returning();

    if (!updated) {
      throw new Error("Prazo não encontrado.");
    }

    await logAuditoria(ctx, {
      tabela: "prazos_processuais",
      registroId: updated.id,
      acao: "UPDATE",
      dadosNovos: updated,
      descricao: `Prazo ${updated.titulo} concluído`,
    });

    return updated;
  }),

  remove: operadorProcedure.input(prazoDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [deleted] = await db.delete(prazosProcessuais).where(eq(prazosProcessuais.id, input.prazoId)).returning();
    if (!deleted) {
      throw new Error("Prazo não encontrado.");
    }

    await logAuditoria(ctx, {
      tabela: "prazos_processuais",
      registroId: deleted.id,
      acao: "DELETE",
      dadosAnteriores: deleted,
      descricao: `Prazo ${deleted.titulo} removido`,
    });

    return { success: true };
  }),
});
