"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { authenticate, startSession, endSession, requireUser } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { loginSchema, commandSchema } from "@/lib/validation";
import { readSnapshot, executeCommand } from "@/lib/orders";
import { db } from "@/lib/db";
import { buildPix } from "@/lib/pix";
import type { FormState, MutationResult } from "@/lib/contracts";

export async function loginAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fields: z.flattenError(parsed.error).fieldErrors, error: "Revise os campos indicados." };
  try {
    const user = await authenticate(parsed.data.email, parsed.data.password);
    await startSession(user.id);
  } catch (error) {
    return { error: publicError(error) };
  }
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function mutateAction(input: unknown): Promise<MutationResult> {
  try {
    const user = await requireUser();
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Revise os campos indicados.", fields: z.flattenError(parsed.error).fieldErrors };
    const command = parsed.data;
    let closingAdminId: number | undefined;
    if (command.type === "closeShift") {
      const admin = await authenticate(command.email, command.password);
      if (admin.role !== "ADMIN") throw new AppError("Esta conta não pode encerrar turnos. Use uma conta ADMIN.");
      closingAdminId = admin.id;
    }
    return await executeCommand(command, user.id, closingAdminId);
  } catch (error) {
    return { ok: false, error: publicError(error) };
  }
}

export async function refreshAction(): Promise<MutationResult> {
  try {
    await requireUser();
    return { ok: true, data: await readSnapshot() };
  } catch (error) {
    return { ok: false, error: publicError(error) };
  }
}

export async function pixAction(orderId: number, expectedTotal: string): Promise<
  { ok: true; payload: string; image: string } | { ok: false; error: string }
> {
  try {
    await requireUser();
    if (!z.number().int().positive().safeParse(orderId).success) throw new AppError("Comanda inválida.");
    if (!z.string().regex(/^\d{1,8}\.\d{2}$/).safeParse(expectedTotal).success) throw new AppError("Valor de cobrança inválido.");
    const shift = await db.shift.findUnique({ where: { openKey: 1 } });
    if (!shift) throw new AppError("Abra um turno antes de gerar o Pix.");
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order || order.state !== "CHECKOUT" || order.paymentStatus === "PAID") throw new AppError("A comanda não está disponível para cobrança.");
    if (!order.totalAmount.equals(expectedTotal)) throw new AppError("O total da conta mudou. Atualize o painel antes de gerar o Pix.");
    let payload: string;
    try {
      payload = buildPix({ key: process.env.PIX_KEY, name: process.env.PIX_NAME ?? process.env.PIX_MERCHANT_NAME, city: process.env.PIX_CITY ?? process.env.PIX_MERCHANT_CITY }, order.totalAmount.toFixed(2), order.id);
    } catch (error) {
      if (error instanceof Error) throw new AppError(error.message);
      throw error;
    }
    return { ok: true, payload, image: await QRCode.toDataURL(payload, { width: 280, margin: 3, errorCorrectionLevel: "M" }) };
  } catch (error) {
    return { ok: false, error: publicError(error) };
  }
}
