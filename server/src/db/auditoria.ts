import { auditoriaLog } from "./schema.js";
import type { AppContext } from "../_core/context.js";
import { requireDb } from "./client.js";

interface AuditEntry {
  tabela: string;
  registroId: number;
  acao: "CREATE" | "UPDATE" | "DELETE";
  dadosAnteriores?: unknown;
  dadosNovos?: unknown;
  descricao?: string;
}

export async function logAuditoria(ctx: AppContext, payload: AuditEntry) {
  const db = requireDb();
  await db.insert(auditoriaLog).values({
    usuarioId: ctx.user?.id ?? null,
    tabela: payload.tabela,
    registroId: payload.registroId,
    acao: payload.acao,
    dadosAnteriores: payload.dadosAnteriores ?? null,
    dadosNovos: payload.dadosNovos ?? null,
    descricao: payload.descricao ?? null
  });
}

