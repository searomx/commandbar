import "server-only";
import { Prisma } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { commandSchema } from "@/lib/validation";
import { buildDailyReport, reportDay } from "@/lib/daily-report";
import { sendDailyReport } from "@/lib/report-email";
import type { Snapshot } from "@/lib/contracts";
import type { z } from "zod";

type Tx = Prisma.TransactionClient;
type ValidCommand = z.output<typeof commandSchema>;

export async function readSnapshot(client: Tx = db): Promise<Snapshot> {
  const shift = await client.shift.findUnique({ where: { openKey: 1 } });
  const [customers, products, orders] = await Promise.all([
    client.customer.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    client.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, price: true } }),
    client.order.findMany({
      where: {
        OR: [
          { paymentStatus: { not: "PAID" } },
          ...(shift ? [{ paymentShiftId: shift.id }] : []),
        ],
      },
      include: { customer: { select: { id: true, name: true, phone: true } }, items: { include: { product: { select: { name: true } } }, orderBy: { id: "asc" } } },
      orderBy: { id: "desc" },
    }),
  ]);
  return {
    shift: shift ? { id: shift.id, openedAt: shift.openedAt.toISOString() } : null,
    customers,
    products: products.map((p) => ({ ...p, price: p.price.toFixed(2) })),
    orders: orders.map((o) => ({
      id: o.id, customer: o.customer, total: o.totalAmount.toFixed(2),
      state: o.state, paymentStatus: o.paymentStatus, createdAt: o.createdAt.toISOString(),
      paymentDate: o.paymentDate?.toISOString() ?? null,
      carried: o.paymentStatus !== "PAID" && o.shiftId !== shift?.id,
      items: o.items.map((i) => ({
        id: i.id, productId: i.productId, name: i.product.name,
        price: i.price.toFixed(2), quantity: i.quantity.toString(), unit: i.unit,
        subtotal: i.price.mul(i.quantity).toDecimalPlaces(2).toFixed(2),
      })),
    })),
  };
}

async function recalculate(tx: Tx, orderId: number) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const total = items.reduce((sum, i) => sum.add(i.price.mul(i.quantity).toDecimalPlaces(2)), new Prisma.Decimal(0));
  if (total.greaterThan("99999999.99")) throw new AppError("O total excede o limite permitido para a comanda.");
  await tx.order.update({ where: { id: orderId }, data: { totalAmount: total } });
}

export async function executeCommand(command: ValidCommand, userId: number, closingAdminId?: number) {
  return db.$transaction(async (tx) => {
    // One bar-wide lock keeps turn changes atomic with all order mutations.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72401935)`;
    const shift = await tx.shift.findUnique({ where: { openKey: 1 } });
    let orderId: number | undefined;
    let customerId: number | undefined;
    if (command.type === "openShift") {
      if (shift) throw new AppError("Já existe um turno aberto. Atualize o painel.");
      await tx.shift.create({ data: { openKey: 1, openedBy: userId } });
    } else {
      if (!shift) throw new AppError("O turno está encerrado. Abra um novo turno antes de continuar.");
      if (command.type === "closeShift") {
        if (!closingAdminId) throw new AppError("É necessária a autorização de ADMIN.");
        if (shift.id !== command.shiftId) throw new AppError("O turno mudou. Atualize e confirme o turno atual.");
        const [admin, user] = await Promise.all([
          tx.user.findUnique({ where: { id: closingAdminId }, select: { role: true, email: true } }),
          tx.user.findUnique({ where: { id: userId }, select: { name: true } }),
        ]);
        if (!admin || admin.role !== "ADMIN") throw new AppError("É necessária a autorização de ADMIN.");
        if (!user) throw new AppError("Usuário não encontrado. Entre novamente.");
        const closedAt = new Date();
        const { start, end } = reportDay(closedAt);
        const orders = await tx.order.findMany({
          where: { createdAt: { gte: start, lt: end } },
          select: { customerId: true, customer: { select: { name: true } }, createdAt: true, totalAmount: true, paymentStatus: true },
        });
        await sendDailyReport(buildDailyReport(closedAt, user.name, orders), admin.email);
        await tx.shift.update({ where: { id: shift.id }, data: { openKey: null, closedAt, closedBy: closingAdminId } });
      } else if (command.type === "customer") {
        const customer = await tx.customer.create({ data: { name: command.name, phone: command.phone || null } });
        customerId = customer.id;
      } else if (command.type === "order") {
        const customer = await tx.customer.findUnique({ where: { id: command.customerId } });
        if (!customer) throw new AppError("Selecione um cliente cadastrado.");
        const existing = await tx.order.findFirst({ where: { customerId: customer.id, paymentStatus: { not: "PAID" } } });
        if (existing) throw new AppError(`Este cliente já tem a comanda #${existing.id} pendente.`);
        const created = await tx.order.create({ data: { customerId: customer.id, shiftId: shift.id, totalAmount: 0 } });
        orderId = created.id;
      } else {
        const order = await tx.order.findUnique({ where: { id: command.orderId } });
        if (!order) throw new AppError("Comanda não encontrada. Atualize o painel.");
        orderId = order.id;
        if (order.paymentStatus === "PAID") {
          if (command.type !== "pay") throw new AppError("Esta comanda já foi paga e não pode ser alterada.");
          if (order.paymentMethod !== command.method || !order.totalAmount.equals(command.expectedTotal)) {
            throw new AppError("Esta comanda já foi paga com outros dados. Confira o recebimento registrado antes de continuar.");
          }
        } else if (command.type === "pay") {
          if (order.state !== "CHECKOUT") throw new AppError("Feche a comanda para cobrança antes de confirmar o recebimento.");
          if (!order.totalAmount.equals(command.expectedTotal)) throw new AppError("O total da conta mudou. Atualize e confira o recebimento antes de confirmar.");
          if (order.totalAmount.lessThanOrEqualTo(0)) throw new AppError("Inclua despesas antes de confirmar o pagamento.");
          await tx.order.update({
            where: { id: order.id },
            data: { state: "PAID", paymentStatus: "PAID", paymentDate: new Date(), paymentMethod: command.method, paymentShiftId: shift.id },
          });
        } else if (command.type === "checkout") {
          if (order.totalAmount.lessThanOrEqualTo(0)) throw new AppError("Inclua despesas antes de fechar a comanda.");
          await tx.order.update({ where: { id: order.id }, data: { state: "CHECKOUT" } });
        } else if (command.type === "reopen") {
          await tx.order.update({ where: { id: order.id }, data: { state: "OPEN" } });
        } else {
          if (order.state !== "OPEN") throw new AppError("Volte à edição antes de alterar as despesas.");
          if (command.type === "item") {
            const product = await tx.product.findUnique({ where: { id: command.productId } });
            if (!product) throw new AppError("Produto não encontrado no catálogo.");
            if (product.price.lessThan(0)) throw new AppError("O preço deste produto está inválido. Solicite a correção do catálogo.");
            await tx.orderItem.create({
              data: { orderId: order.id, productId: product.id, quantity: command.quantity, price: product.price, unit: product.unit },
            });
          } else {
            const item = await tx.orderItem.findFirst({ where: { id: command.itemId, orderId: order.id } });
            if (!item) throw new AppError("Item não encontrado nesta comanda.");
            if (command.type === "remove") await tx.orderItem.delete({ where: { id: item.id } });
            else await tx.orderItem.update({ where: { id: item.id }, data: { quantity: command.quantity } });
          }
          await recalculate(tx, order.id);
        }
      }
    }
    return { ok: true as const, data: await readSnapshot(tx), orderId, customerId };
  }, { timeout: command.type === "closeShift" ? 120_000 : 15_000 });
}
