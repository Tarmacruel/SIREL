import { modalidadeCatalog } from "@sirel/shared/const";
import { eq } from "drizzle-orm";

import { processos } from "../db/schema.js";

type Database = { select: (...args: any[]) => any };

function parseSirelSequence(value: string | null | undefined, year: number) {
  if (!value) return 0;
  const match = value.match(/^(\d{1,6})\/(\d{4})$/);
  if (!match) return 0;
  if (Number(match[2]) !== year) return 0;
  return Number(match[1]);
}

function parseEditalSequence(value: string | null | undefined, prefix: string, year: number) {
  if (!value) return 0;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value.match(new RegExp(`^${escapedPrefix}-(\\d{1,6})-(\\d{4})$`));
  if (!match) return 0;
  if (Number(match[2]) !== year) return 0;
  return Number(match[1]);
}

function formatSirelSequence(sequence: number, year: number) {
  return `${String(sequence).padStart(4, "0")}/${year}`;
}

function formatEditalSequence(prefix: string, sequence: number, year: number) {
  return `${prefix}-${String(sequence).padStart(3, "0")}-${year}`;
}

export async function getNextNumeroSirel(db: Database, year: number) {
  const rows = await db.select({ numeroSirel: processos.numeroSirel }).from(processos).where(eq(processos.anoReferencia, year));
  const currentMax = rows.reduce((max: number, row: { numeroSirel: string | null }) => Math.max(max, parseSirelSequence(row.numeroSirel, year)), 0);
  return formatSirelSequence(currentMax + 1, year);
}

export async function getNextNumeroEdital(db: Database, year: number, modalidadeCodigo: string) {
  const modalidade = modalidadeCatalog.find((item) => item.codigo === modalidadeCodigo);
  if (!modalidade) {
    throw new Error(`Modalidade sem sigla de edital configurada: ${modalidadeCodigo}`);
  }
  const rows = await db.select({ numeroEdital: processos.numeroEdital }).from(processos).where(eq(processos.anoReferencia, year));
  const currentMax = rows.reduce(
    (max: number, row: { numeroEdital: string | null }) => Math.max(max, parseEditalSequence(row.numeroEdital, modalidade.siglaEdital, year)),
    0,
  );
  return formatEditalSequence(modalidade.siglaEdital, currentMax + 1, year);
}
