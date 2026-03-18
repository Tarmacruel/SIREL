import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import type { AppContext } from "./_core/context.js";
import { requireAdmin, requireAuditor, requireGestor, requireOperador } from "./auth.js";

const t = initTRPC.context<AppContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login obrigatorio" });
  }
  return next({ ctx });
});

export const operadorProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireOperador(ctx);
  return next({ ctx });
});

export const gestorProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireGestor(ctx);
  return next({ ctx });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireAdmin(ctx);
  return next({ ctx });
});

export const auditorProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireAuditor(ctx);
  return next({ ctx });
});
