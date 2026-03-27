import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { appRouter } from "../routers/index.js";
import { requireDb, databaseEnabled } from "../db/client.js";
import {
  auditoriaLog,
  importacaoBllProcessos,
  processos,
  prazosProcessuais,
  secretarias,
  users,
} from "../db/schema.js";
import { linkImportedProcessToInternal } from "../lib/importacoes-conciliacao.js";

const suite = databaseEnabled ? describe.sequential : describe.skip;

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(days: number) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  return base;
}

async function ensureSecretariaId(db: any) {
  const [row] = await db
    .select({ id: secretarias.id })
    .from(secretarias)
    .limit(1);
  if (row?.id) return row.id;
  const [created] = await db
    .insert(secretarias)
    .values({
      sigla: `TEST-${Date.now()}`,
      nome: "Secretaria Teste",
      ativo: true,
    })
    .returning({ id: secretarias.id });
  return created.id;
}

async function ensureUserId(db: any) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .limit(1);
  if (row?.id) return row.id;
  const [created] = await db
    .insert(users)
    .values({
      username: `teste_${Date.now()}`,
      name: "Usuario Teste",
      email: "teste@sirel.local",
      role: "operador",
      ativo: true,
    })
    .returning({ id: users.id });
  return created.id;
}

async function createProcess(db: any, secretariaId: number) {
  const numeroSirel = `TEST-${Date.now()}`;
  const [row] = await db
    .insert(processos)
    .values({
      numeroSirel,
      anoReferencia: new Date().getFullYear(),
      secretariaId,
      objeto: "Processo de teste da importacao",
      escopoDisputa: "GLOBAL",
      tipoObjeto: "PRODUTO",
      tipoContratacao: "AQUISICAO",
      foraDoFluxo: false,
    })
    .returning({ id: processos.id, numeroSirel: processos.numeroSirel });
  return row;
}

async function createImportedProcess(db: any, futureDate: Date) {
  const chaveExterna = `IMP-${Date.now()}`;
  const [row] = await db
    .insert(importacaoBllProcessos)
    .values({
      origem: "LICITACAO",
      chaveExterna,
      modalidade: "Pregao Eletronico",
      objeto: "Objeto importado para teste",
      inicioDisputaEm: futureDate,
      totalLotes: 0,
      totalItens: 0,
    })
    .returning({ id: importacaoBllProcessos.id, chaveExterna: importacaoBllProcessos.chaveExterna });
  return row;
}

async function cleanup(db: any, ids: { processoId?: number; importedId?: number }) {
  if (ids.importedId) {
    await db
      .delete(auditoriaLog)
      .where(and(eq(auditoriaLog.tabela, "importacao_bll_processos"), eq(auditoriaLog.registroId, ids.importedId)));
    await db
      .delete(importacaoBllProcessos)
      .where(eq(importacaoBllProcessos.id, ids.importedId));
  }
  if (ids.processoId) {
    await db
      .delete(prazosProcessuais)
      .where(eq(prazosProcessuais.processoId, ids.processoId));
    await db
      .delete(processos)
      .where(eq(processos.id, ids.processoId));
  }
}

suite("importacao -> vinculo -> agenda", () => {
  it("cria agenda de sessao publica ao vincular", async () => {
    const db = requireDb();
    const secretariaId = await ensureSecretariaId(db);
    const userId = await ensureUserId(db);
    const future = addDays(5);

    const process = await createProcess(db, secretariaId);
    const imported = await createImportedProcess(db, future);

    try {
      await linkImportedProcessToInternal(imported.id, process.id, userId, "MANUAL");

      const [agenda] = await db
        .select({
          id: prazosProcessuais.id,
          dataPrevista: prazosProcessuais.dataPrevista,
          status: prazosProcessuais.status,
        })
        .from(prazosProcessuais)
        .where(eq(prazosProcessuais.processoId, process.id))
        .limit(1);

      expect(agenda).toBeTruthy();
      expect(agenda.dataPrevista).toBe(dateOnly(future));
      expect(agenda.status).toBe("PENDENTE");
    } finally {
      await cleanup(db, { processoId: process.id, importedId: imported.id });
    }
  });

  it("reagenda prazo quando a data importada muda", async () => {
    const db = requireDb();
    const secretariaId = await ensureSecretariaId(db);
    const userId = await ensureUserId(db);

    const process = await createProcess(db, secretariaId);
    const imported = await createImportedProcess(db, addDays(4));

    try {
      await linkImportedProcessToInternal(imported.id, process.id, userId, "MANUAL");

      const newDate = addDays(10);
      await db
        .update(importacaoBllProcessos)
        .set({ inicioDisputaEm: newDate })
        .where(eq(importacaoBllProcessos.id, imported.id));

      await linkImportedProcessToInternal(imported.id, process.id, userId, "MANUAL");

      const [agenda] = await db
        .select({
          dataPrevista: prazosProcessuais.dataPrevista,
          observacao: prazosProcessuais.observacao,
        })
        .from(prazosProcessuais)
        .where(eq(prazosProcessuais.processoId, process.id))
        .limit(1);

      expect(agenda.dataPrevista).toBe(dateOnly(newDate));
      expect(String(agenda.observacao ?? "").toLowerCase()).toContain("reagendado automaticamente");
    } finally {
      await cleanup(db, { processoId: process.id, importedId: imported.id });
    }
  });

  it("e2e: vinculo via router gera item na agenda", async () => {
    const db = requireDb();
    const secretariaId = await ensureSecretariaId(db);
    const userId = await ensureUserId(db);
    const future = addDays(6);

    const process = await createProcess(db, secretariaId);
    const imported = await createImportedProcess(db, future);

    const ctx = {
      req: { headers: {} },
      res: {},
      db,
      databaseEnabled: true,
      user: {
        id: userId,
        username: "tester",
        name: "Tester",
        email: "tester@sirel.local",
        role: "operador",
        secretariaId,
      },
    };

    try {
      const caller = appRouter.createCaller(ctx as any);
      await caller.importacoes.linkProcesso({ importedId: imported.id, processoId: process.id });

      const agenda = await caller.prazos.agendaList({
        pagina: 1,
        limite: 20,
        processoId: process.id,
      });

      expect(agenda.total).toBeGreaterThan(0);
      expect(agenda.items.some((item) => item.processoId === process.id)).toBe(true);
    } finally {
      await cleanup(db, { processoId: process.id, importedId: imported.id });
    }
  });
});
