import { z, type ZodError } from "zod";

export function mapZodFieldErrors(error: ZodError) {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path.join(".") || "form";
    if (!acc[key]) acc[key] = issue.message;
    return acc;
  }, {});
}

export function readErrorMessage(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof z.ZodError && error.issues[0]?.message) return error.issues[0].message;
  return fallback;
}
