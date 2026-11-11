import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { hashPassword, verifyPassword } from "../lib/password";
import { delimiter, resolve } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { PDFParse } from "pdf-parse";
import { reportDay } from "../lib/daily-report";

test("fluxos reais de comandas em schema isolado e descartável", { timeout: 120_000 }, async (t) => {
  const original = process.env.DATABASE_URL;
  assert.ok(original, "Configure DATABASE_URL para executar testes de integração.");
  const schema = `commandbar_test_${randomBytes(8).toString("hex")}`;
  const url = new URL(original);
  url.searchParams.set("schema", schema);
  const pool = new Pool({ connectionString: original });
  let disconnect: (() => Promise<void>) | undefined;
  const temp = await mkdtemp(join(tmpdir(), "commandbar-smtp-test-"));
  const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SMTP_CA_FILE"] as const;
  const originalSmtp = Object.fromEntries(smtpKeys.map((key) => [key, process.env[key]]));
  const messages: Buffer[] = [];
  let rejectMail = false;
  let holdMail: (() => Promise<void>) | undefined;
  let smtp: SMTPServer | undefined;
  const secureSmtp = process.env.SMTP_TEST_SECURE === "true";
  try {
    const keyFile = join(temp, "key.pem");
    const certFile = join(temp, "cert.pem");
    await promisify(execFile)("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile,
      "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE"]);
    smtp = new SMTPServer({
      secure: secureSmtp, key: await readFile(keyFile), cert: await readFile(certFile),
      onAuth(auth, _session, callback) {
        if (auth.username === "test" && auth.password === "test") callback(null, { user: "test" });
        else callback(new Error("Credenciais inválidas"));
      },
      onData(stream, _session, callback) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", async () => {
          if (rejectMail) callback(new Error("Falha SMTP simulada"));
          else {
            if (holdMail) await holdMail();
            messages.push(Buffer.concat(chunks));
            callback();
          }
        });
      },
    });
    await new Promise<void>((resolve, reject) => {
      smtp!.once("error", reject);
      smtp!.listen(0, "127.0.0.1", resolve);
    });
    const address = smtp.server.address();
    assert.ok(address && typeof address !== "string");
    Object.assign(process.env, {
      SMTP_HOST: "127.0.0.1", SMTP_PORT: String(address.port), SMTP_SECURE: String(secureSmtp),
      SMTP_USER: "test", SMTP_PASSWORD: "test", SMTP_FROM: "remetente@example.test", SMTP_CA_FILE: certFile,
    });
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
    await t.test("seed da CLI cria administrador com senha compatível e preserva conta existente", async () => {
      const password = "Senha-Seed-Teste-1234";
      const runSeed = (seedPassword: string) => promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed", "--config", "prisma7.config.ts"], {
        env: {
          ...process.env,
          PATH: `${resolve("node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`,
          SEED_ADMIN_PASSWORD: seedPassword,
        },
        timeout: 60_000,
      });
      await runSeed(password);
      const seeded = await db.user.findUniqueOrThrow({ where: { email: "searomx@gmail.com" } });
      assert.equal(seeded.role, "ADMIN");
      assert.equal(await verifyPassword(password, seeded.password), true);
      await runSeed("Outra-Senha-Teste-1234");
      const unchanged = await db.user.findUniqueOrThrow({ where: { id: seeded.id } });
      assert.equal(unchanged.password, seeded.password);
    });
    const admin = await db.user.create({ data: {
      name: "Teste administrador", email: "admin@example.test",
      password: await hashPassword("Senha-Teste-1234"), role: "ADMIN",
    } });
    const user = await db.user.create({ data: {
      name: "Teste atendimento", email: "user@example.test",
      password: await hashPassword("Senha-Teste-1234"), role: "USER",
    } });
    const category = await db.categories.create({ data: { name: "Categoria teste" } });
    const group = await db.groups.create({ data: { name: "Grupo teste" } });
    const product = await db.product.create({ data: { name: "Produto de teste", price: "10.10", unit: "un", description: "", mark: "", stockAmount: 10, categoryId: category.id, groupId: group.id } });
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
      const manager = await db.user.findUniqueOrThrow({ where: { email: "Manager@example.test" } });
      await assert.rejects(executeCommand({ type: "closeShift", shiftId, email: "", password: "" }, user.id, manager.id), /ADMIN/);
      const savedHost = process.env.SMTP_HOST;
      assert.ok(savedHost);
      delete process.env.SMTP_HOST;
      await assert.rejects(executeCommand({ type: "closeShift", shiftId, email: "", password: "" }, user.id, admin.id), /Configure SMTP_HOST/);
      process.env.SMTP_HOST = savedHost;
      assert.equal((await readSnapshot()).shift?.id, shiftId);
      rejectMail = true;
      await assert.rejects(executeCommand({ type: "closeShift", shiftId, email: "", password: "" }, user.id, admin.id), /continua aberto/);
      rejectMail = false;
      assert.equal((await readSnapshot()).shift?.id, shiftId);
      assert.equal(messages.length, 0);
      const oldCustomer = await db.customer.create({ data: { name: "Fora do dia" } });
      await db.order.create({ data: {
        customerId: oldCustomer.id, totalAmount: "9999.99", paymentStatus: "PAID",
        createdAt: new Date(reportDay(new Date()).start.getTime() - 1),
      } });
      await db.order.create({ data: { customerId: customer.id, totalAmount: "1.25", paymentStatus: "PAID" } });
      let releaseMail!: () => void;
      let mailArrived!: () => void;
      const mailHeld = new Promise<void>((resolve) => { releaseMail = resolve; });
      const mailReady = new Promise<void>((resolve) => { mailArrived = resolve; });
      holdMail = async () => { mailArrived(); await mailHeld; };
      const closing = executeCommand({ type: "closeShift", shiftId, email: "", password: "" }, user.id, admin.id);
      await mailReady;
      const mutation = executeCommand({ type: "checkout", orderId }, user.id);
      try {
        const state = await Promise.race([mutation.then(() => "finished", () => "finished"), new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 100))]);
        assert.equal(state, "waiting");
      } finally {
        holdMail = undefined;
        releaseMail();
      }
      await closing;
      await assert.rejects(mutation, /encerrado/);
      const email = await simpleParser(messages[0]);
      assert.equal(email.to && !Array.isArray(email.to) ? email.to.value[0].address : undefined, admin.email);
      assert.equal(email.attachments.length, 1);
      assert.equal(email.attachments[0].contentType, "application/pdf");
      const parser = new PDFParse({ data: email.attachments[0].content });
      try {
        const { text } = await parser.getText();
        for (const expected of ["Relatório Diário de Movimentação", user.name, customer.name, "20,20", "1,25", "21,45", "Pendente", "Pago"]) {
          assert.ok(text.includes(expected), `Texto ausente no relatório: ${expected}`);
        }
        assert.ok(!text.includes("Fora do dia"));
      } finally { await parser.destroy(); }
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
    await new Promise<void>((resolve, reject) => {
      if (!smtp?.server.listening) return resolve();
      smtp.close((error?: Error) => error ? reject(error) : resolve());
    });
    for (const key of smtpKeys) {
      const value = originalSmtp[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temp, { recursive: true, force: true });
    await disconnect?.();
    process.env.DATABASE_URL = original;
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
