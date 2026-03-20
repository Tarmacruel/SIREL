import { and, eq } from "drizzle-orm";

import { parametrosSistema } from "../db/schema.js";

function normalizeKey(key: string) {
  return key.trim().toUpperCase();
}

function parseStoredValue(row: { valorJson: unknown; valor: string }) {
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

export async function getSystemParamValue(db: any, key: string) {
  const normalized = normalizeKey(key);
  const [row] = await db
    .select({
      valor: parametrosSistema.valor,
      valorJson: parametrosSistema.valorJson,
    })
    .from(parametrosSistema)
    .where(and(eq(parametrosSistema.chave, normalized), eq(parametrosSistema.ativo, true)))
    .limit(1);

  if (!row) return undefined;
  return parseStoredValue(row);
}

export async function getSystemParamNumber(db: any, key: string, fallback: number) {
  const value = await getSystemParamValue(db, key);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getSystemParamNumberArray(db: any, key: string, fallback: number[]) {
  const value = await getSystemParamValue(db, key);
  if (!Array.isArray(value)) return fallback;
  const parsed = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  return parsed.length ? parsed : fallback;
}
