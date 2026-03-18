import type { inferAsyncReturnType } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

import { db, databaseEnabled } from "../db/client.js";
import { verifySessionToken } from "../lib/auth-session.js";

export async function createContext(opts: CreateExpressContextOptions) {
  const authHeader = String(opts.req.headers.authorization ?? "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const sessionPayload = verifySessionToken(bearerToken);
  const roleHeader = String(opts.req.headers["x-sirel-role"] ?? "").trim();
  const userId = Number(opts.req.headers["x-sirel-user-id"] ?? 0) || 1;
  const secretariaId = Number(opts.req.headers["x-sirel-secretaria-id"] ?? 0) || null;

  return {
    req: opts.req,
    res: opts.res,
    db,
    databaseEnabled,
    user: sessionPayload
      ? {
          id: sessionPayload.sub,
          username: sessionPayload.username,
          name: sessionPayload.name,
          email: sessionPayload.email ?? "",
          role: sessionPayload.role,
          secretariaId: sessionPayload.secretariaId,
        }
      : roleHeader
      ? {
          id: userId,
          username: String(opts.req.headers["x-sirel-username"] ?? "demo"),
          name: String(opts.req.headers["x-sirel-user-name"] ?? "Usuario demo"),
          email: String(opts.req.headers["x-sirel-user-email"] ?? "demo@sirel.local"),
          role: roleHeader,
          secretariaId
        }
      : null
  };
}

export type AppContext = inferAsyncReturnType<typeof createContext>;
