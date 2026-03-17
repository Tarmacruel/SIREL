import { LEGACY_ADMIN_TERM_REPLACEMENTS, LEGACY_CATALOG_DICTIONARY } from "./legacy-semantic-dictionary.js";

const MOJIBAKE_SEGMENT_RE = /(?:Ã.|Â.|â.|ï»¿|�)+/g;
const ACCENT_RE = /[ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]/g;

export type LegacyCatalogField = keyof typeof LEGACY_CATALOG_DICTIONARY;

function suspiciousScore(text: string): number {
  return text.split("Ã").length - 1 + text.split("Â").length - 1 + text.split("â").length - 1 + text.split("�").length - 1;
}

function accentScore(text: string): number {
  return (text.match(ACCENT_RE) ?? []).length;
}

export function fixMojibake(text: string, maxRounds = 3): string {
  let current = text;
  for (let round = 0; round < Math.max(1, maxRounds); round += 1) {
    const candidate = Buffer.from(current, "latin1").toString("utf8");
    if (!candidate || candidate === current) break;
    const currentScore = [suspiciousScore(current), -accentScore(current), current.length];
    const candidateScore = [suspiciousScore(candidate), -accentScore(candidate), candidate.length];
    const improved = candidateScore[0] < currentScore[0]
      || (candidateScore[0] === currentScore[0] && candidateScore[1] < currentScore[1])
      || (candidateScore[0] === currentScore[0] && candidateScore[1] === currentScore[1] && candidateScore[2] < currentScore[2]);
    if (!improved) break;
    current = candidate;
  }
  return current;
}

export function fixMojibakeSegments(text: string): string {
  return text.replace(MOJIBAKE_SEGMENT_RE, (segment) => {
    const fixed = fixMojibake(segment);
    return suspiciousScore(fixed) < suspiciousScore(segment) ? fixed : segment;
  });
}

export function sanitizeLegacyText(value: unknown): string {
  const text = String(value ?? "");
  if (!text) return "";
  const repaired = fixMojibakeSegments(fixMojibake(text)).replace(/\u0000/g, "");
  return LEGACY_ADMIN_TERM_REPLACEMENTS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), repaired);
}

export function toCleanString(value: unknown, fallback = ""): string {
  const text = sanitizeLegacyText(value).trim();
  return text || fallback;
}

export function normalizeLegacyCatalogLabel(field: LegacyCatalogField, value: unknown, fallback = ""): string {
  const text = toCleanString(value, fallback);
  const catalog = LEGACY_CATALOG_DICTIONARY[field];
  const key = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return catalog[key as keyof typeof catalog] ?? text;
}
