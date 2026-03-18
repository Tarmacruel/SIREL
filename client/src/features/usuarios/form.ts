import {
  usuarioChangePasswordInputSchema,
  usuarioCreateInputSchema,
  usuarioUpdateInputSchema,
} from "@sirel/shared/schemas/usuarios";

export function validateCreateUserForm(input: unknown) {
  return usuarioCreateInputSchema.safeParse(input);
}

export function validateUpdateUserForm(input: unknown) {
  return usuarioUpdateInputSchema.safeParse(input);
}

export function validateChangePasswordForm(input: unknown) {
  return usuarioChangePasswordInputSchema.safeParse(input);
}
