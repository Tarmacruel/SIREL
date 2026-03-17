import { z } from "zod";

export const usuarioListInputSchema = z.object({
  search: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
});

export const usuarioCreateInputSchema = z.object({
  username: z.string().trim().min(3).max(80),
  name: z.string().trim().min(3).max(255),
  email: z.string().trim().email().optional(),
  role: z.enum(["user", "admin", "gestor", "operador"]),
  secretariaId: z.number().int().positive().optional(),
  ativo: z.boolean().default(true),
  password: z.string().min(8).max(120),
});

export const usuarioUpdateInputSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string().trim().min(3).max(255),
  email: z.string().trim().email().optional(),
  role: z.enum(["user", "admin", "gestor", "operador"]),
  secretariaId: z.number().int().positive().nullable().optional(),
  ativo: z.boolean(),
});

export const usuarioResetPasswordInputSchema = z.object({
  userId: z.number().int().positive(),
  newPassword: z.string().min(8).max(120),
});

export const usuarioChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(120),
    confirmPassword: z.string().min(8).max(120),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "A confirmacao da senha nao confere.",
      });
    }
  });

export type UsuarioListInput = z.infer<typeof usuarioListInputSchema>;
export type UsuarioCreateInput = z.infer<typeof usuarioCreateInputSchema>;
export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateInputSchema>;
export type UsuarioResetPasswordInput = z.infer<typeof usuarioResetPasswordInputSchema>;
export type UsuarioChangePasswordInput = z.infer<typeof usuarioChangePasswordInputSchema>;
