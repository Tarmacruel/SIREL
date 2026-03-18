import { TRPCError } from "@trpc/server";

import type { AppContext } from "./_core/context.js";

export type UserRole = "user" | "admin" | "gestor" | "operador";

export function hasRole(ctx: AppContext, role: UserRole | UserRole[]): boolean {
  if (!ctx.user) return false;
  const roles = Array.isArray(role) ? role : [role];
  return roles.includes(ctx.user.role as UserRole);
}

export function requireAdmin(ctx: AppContext) {
  if (!hasRole(ctx, "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  }
}

export function requireGestor(ctx: AppContext) {
  if (!hasRole(ctx, ["admin", "gestor"])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a gestores" });
  }
}

export function requireOperador(ctx: AppContext) {
  if (!hasRole(ctx, ["admin", "gestor", "operador"])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a operadores" });
  }
}
