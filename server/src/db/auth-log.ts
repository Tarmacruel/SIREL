import { authLog } from "./schema.js";
import { requireDb } from "./client.js";

type AuthEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGIN_BLOCKED"
  | "PASSWORD_CHANGE"
  | "PASSWORD_RESET";

interface LogAuthEventInput {
  userId?: number | null;
  loginInformado?: string | null;
  loginNormalizado?: string | null;
  ipAddress?: string | null;
  evento: AuthEvent;
  detalhe?: string | null;
}

export async function logAuthEvent(input: LogAuthEventInput) {
  const db = requireDb();

  await db.insert(authLog).values({
    userId: input.userId ?? null,
    loginInformado: input.loginInformado?.trim() || null,
    loginNormalizado: input.loginNormalizado?.trim().toLowerCase() || null,
    ipAddress: input.ipAddress?.trim() || null,
    evento: input.evento,
    detalhe: input.detalhe?.trim() || null,
    criadoEm: new Date(),
  });
}
