const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("pt-BR");

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function formatCurrencyBRL(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? currencyFormatter.format(parsed) : "-";
}

export function formatNumberBR(value: number | string | null | undefined, maximumFractionDigits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(parsed);
}

export function formatIntegerBR(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? integerFormatter.format(parsed) : "-";
}

export function formatShortDateBR(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : shortDateFormatter.format(date);
}

export function formatShortDateTimeBR(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : shortDateTimeFormatter.format(date);
}

export function formatCnpjBR(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length !== 14) return value?.trim() || "-";

  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function normalizeDecimalInput(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatDecimalInput(value: number | string | null | undefined, maximumFractionDigits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? numberFormatter.format(parsed) : "";
}
