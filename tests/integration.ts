import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { hashPassword } from "../lib/password";

test("fluxos reais de comandas em schema isolado e descartável", { timeout: 120_000 }, async (t) => {
  const original = process.env.DATABASE_URL;
  assert.ok(original, "Configure DATABASE_URL para executar testes de integração.");
  const schema = `commandbar_test_${randomBytes(8).toString("hex")}`;
  const url = new URL(original);
  url.searchParams.set("schema", schema);
  const pool = new Pool({ connectionString: original });
  let disconnect: (() => Promise<void>) | undefined;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    process.env.DATABASE_URL = url.toString();
    try {
      await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"], {
        env: { ...process.env }, timeout: 60_000,
      });
    } catch { throw new Error("Falha ao aplicar migrações no schema de teste. Credenciais omitidas."); }
    const { db } = await import("../lib/db");
    const { executeCommand, readSnapshot } = await import("../lib/orders");
    const { authenticate } = await import("../lib/auth");
    disconnect = () => db.$disconnect();
    const admin = await db.user.create({ data: {
      name: "Teste administrador", email: "admin@example.test",
      password: await hashPassword("Senha-Teste-1234"), role: "ADMIN",
    } });
    const user = await db.user.create({ data: {
      name: "Teste atendimento", email: "user@example.test",
      password: await hashPassword("Senha-Teste-1234"), role: "USER",
    } });
    const product = await db.product.create({ data: { name: "Produto de teste", price: "10.10", unit: "un", description: "", mark: "", stockAmount: 10 } });
    const customer = await db.customer.create({ data: { name: "Cliente de teste" } });

    await t.test("credenciais inválidas e bloqueio após cinco tentativas", async () => {
      assert.equal((await authenticate(admin.email, "Senha-Teste-1234")).id, admin.id);
      assert.equal((await authenticate(admin.email.toUpperCase(), "Senha-Teste-1234")).id, admin.id);
      await db.user.create({ data: {
        name: "Gerente", email: "Manager@example.test",
        password: await hashPassword("Senha-Teste-1234"), role: "MANAGER",
      } });
      assert.equal((await authenticate("manager@example.test", "Senha-Teste-1234")).role, "MANAGER");
      await assert.rejects(db.user.create({ data: {
        name: "Duplicado", email: admin.email.toUpperCase(), password: "invalid", role: "USER",
      } }));
      for (let i = 0; i < 4; i++) await assert.rejects(authenticate("ausente@example.test", "incorreta"), /incorretos/);
      await assert.rejects(authenticate("ausente@example.test", "incorreta"), /15 minutos/);
      await assert.rejects(authenticate("ausente@example.test", "incorreta"), /15 minutos/);
    });
    await t.test("turno único e cadastro de cliente", async () => {
      await executeCommand({ type: "openShift" }, admin.id);
      await assert.rejects(executeCommand({ type: "openShift" }, user.id), /Já existe/);
      const result = await executeCommand({ type: "customer", name: "Outro cliente", phone: "" }, user.id);
      assert.ok(result.data.customers.some((c) => c.id === result.customerId));
    });
    const result = await executeCommand({ type: "order", customerId: customer.id }, user.id);
    const orderId = result.orderId!;
    await t.test("criação concorrente não duplica comanda pendente", async () => {
      const outcomes = await Promise.allSettled([
        executeCommand({ type: "order", customerId: customer.id }, user.id),
        executeCommand({ type: "order", customerId: customer.id }, user.id),
      ]);
      assert.ok(outcomes.every((r) => r.status === "rejected"));
      assert.equal(await db.order.count({ where: { customerId: customer.id } }), 1);
      const concurrentCustomer = await db.customer.create({ data: { name: "Cliente concorrente" } });
      const simultaneous = await Promise.allSettled([
        executeCommand({ type: "order", customerId: concurrentCustomer.id }, user.id),
        executeCommand({ type: "order", customerId: concurrentCustomer.id }, user.id),
      ]);
      assert.equal(simultaneous.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(simultaneous.filter((r) => r.status === "rejected").length, 1);
      assert.equal(await db.order.count({ where: { customerId: concurrentCustomer.id } }), 1);
    });
    await t.test("precisão monetária, edição, remoção e rollback", async () => {
      await executeCommand({ type: "item", orderId, productId: product.id, quantity: "1.25" }, user.id);
      let order = (await readSnapshot()).orders.find((o) => o.id === orderId)!;
      assert.equal(order.total, "12.63");
      await executeCommand({ type: "quantity", orderId, itemId: order.items[0].id, quantity: "2" }, user.id);
      await executeCommand({ type: "item", orderId, productId: product.id, quantity: "0.10" }, user.id);
      order = (await readSnapshot()).orders.find((o) => o.id === orderId)!;
      assert.equal(order.total, "21.21");
      await executeCommand({ type: "remove", orderId, itemId: order.items[1].id }, user.id);
      assert.equal((await readSnapshot()).orders.find((o) => o.id === orderId)!.total, "20.20");
      await assert.rejects(executeCommand({ type: "item", orderId, productId: 999999, quantity: "1" }, user.id), /não encontrado/);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockAmount.toString(), "10");
    });
    const shiftId = (await readSnapshot()).shift!.id;
    await t.test("fechamento exige autorização e pendências sobrevivem a vários turnos", async () => {
      await assert.rejects(executeCommand({ type: "closeShift", shiftId, email: "", password: "" }, user.id), /autorização/);
      await executeCommand({ type: "closeShift", shiftId, email: "", password: "" }, user.id, admin.id);
      await assert.rejects(executeCommand({ type: "item", orderId, productId: product.id, quantity: "1" }, user.id), /encerrado/);
      await executeCommand({ type: "openShift" }, admin.id);
      const nextShift = (await readSnapshot()).shift!.id;
      assert.equal((await readSnapshot()).orders.find((o) => o.id === orderId)!.carried, true);
      await assert.rejects(executeCommand({ type: "closeShift", shiftId, email: "", password: "" }, user.id, admin.id), /turno mudou/);
      await executeCommand({ type: "closeShift", shiftId: nextShift, email: "", password: "" }, user.id, admin.id);
      await executeCommand({ type: "openShift" }, admin.id);
      assert.equal((await readSnapshot()).orders.find((o) => o.id === orderId)!.carried, true);
    });
    await t.test("cobrança bloqueia itens, permite reabrir e valida total recebido", async () => {
      await assert.rejects(executeCommand({ type: "pay", orderId, expectedTotal: "20.20", method: "CASH" }, user.id), /Feche/);
      await executeCommand({ type: "checkout", orderId }, user.id);
      await assert.rejects(executeCommand({ type: "quantity", orderId, itemId: 1, quantity: "3" }, user.id), /Volte à edição/);
      await executeCommand({ type: "reopen", orderId }, user.id);
      await executeCommand({ type: "checkout", orderId }, user.id);
      await assert.rejects(executeCommand({ type: "pay", orderId, expectedTotal: "1.00", method: "CASH" }, user.id), /total da conta mudou/);
    });
    await t.test("pagamento idempotente grava data, mantém card e impede mutação", async () => {
      await executeCommand({ type: "pay", orderId, expectedTotal: "20.20", method: "CASH" }, user.id);
      await assert.rejects(executeCommand({ type: "pay", orderId, expectedTotal: "20.20", method: "CARD" }, user.id), /outros dados/);
      await assert.rejects(executeCommand({ type: "pay", orderId, expectedTotal: "1.00", method: "CASH" }, user.id), /outros dados/);
      const first = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(first.paymentStatus, "PAID");
      assert.equal(first.paymentMethod, "CASH");
      assert.ok(first.paymentDate);
      await executeCommand({ type: "pay", orderId, expectedTotal: "20.20", method: "CASH" }, user.id);
      const second = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(first.paymentDate?.toISOString(), second.paymentDate?.toISOString());
      await assert.rejects(executeCommand({ type: "reopen", orderId }, user.id), /já foi paga/);
      assert.ok((await readSnapshot()).orders.some((o) => o.id === orderId));
      const current = (await readSnapshot()).shift!.id;
      await executeCommand({ type: "closeShift", shiftId: current, email: "", password: "" }, user.id, admin.id);
      await executeCommand({ type: "openShift" }, admin.id);
      assert.equal((await readSnapshot()).orders.some((o) => o.id === orderId), false);
      assert.equal(await db.order.count({ where: { id: orderId } }), 1);
    });
  } finally {
    await disconnect?.();
    process.env.DATABASE_URL = original;
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
