import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido.").max(50).transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Informe sua senha.").max(200, "Senha muito longa."),
});
export const customerSchema = z.object({
  name: z.string().trim().min(2, "Informe pelo menos 2 caracteres.").max(30, "Use até 30 caracteres."),
  phone: z.string().trim().max(20, "Use até 20 caracteres.").refine(
    (v) => !v || /^\+?[\d ()-]+$/.test(v) && v.replace(/\D/g, "").length >= 10,
    "Informe um telefone com DDD ou deixe em branco.",
  ),
});
const id = z.coerce.number().int().positive("Identificador inválido.");
const quantity = z.string().regex(/^\d{1,5}([.,]\d{1,2})?$/, "Use um número com até duas casas decimais.")
  .transform((v) => v.replace(",", "."))
  .refine((v) => Number(v) > 0 && Number(v) <= 99999.99, "A quantidade deve ser maior que zero.");

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("openShift") }),
  z.object({ type: z.literal("closeShift"), shiftId: id, email: loginSchema.shape.email, password: loginSchema.shape.password }),
  z.object({ type: z.literal("customer"), ...customerSchema.shape }),
  z.object({ type: z.literal("order"), customerId: id }),
  z.object({ type: z.literal("item"), orderId: id, productId: id, quantity }),
  z.object({ type: z.literal("quantity"), orderId: id, itemId: id, quantity }),
  z.object({ type: z.literal("remove"), orderId: id, itemId: id }),
  z.object({ type: z.literal("checkout"), orderId: id }),
  z.object({ type: z.literal("reopen"), orderId: id }),
  z.object({ type: z.literal("pay"), orderId: id, expectedTotal: z.string().regex(/^\d{1,8}\.\d{2}$/), method: z.enum(["PIX", "CASH", "CARD"]) }),
]);
export type Command = z.input<typeof commandSchema>;
