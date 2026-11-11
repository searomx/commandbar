import "dotenv/config";
import { randomBytes } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { createDatabaseClient } from "../lib/database-client";
import { hashPassword } from "../lib/password";

async function main() {
  const original = process.env.DATABASE_URL;
  if (!original) throw new Error("Configure DATABASE_URL.");
  const schema = `commandbar_browser_${randomBytes(8).toString("hex")}`;
  const url = new URL(original);
  url.searchParams.set("schema", schema);
  const pool = new Pool({ connectionString: original });
  let child: ChildProcess | undefined;
  let closing = false;
  const cleanup = async () => {
    if (closing) return;
    closing = true;
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child!.once("exit", () => resolve()));
    }
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  };
  process.once("SIGTERM", () => { void cleanup().then(() => process.exit(0)); });
  process.once("SIGINT", () => { void cleanup().then(() => process.exit(0)); });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    process.env.DATABASE_URL = url.toString();
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"], { env: process.env });
    const db = createDatabaseClient();
    const password = randomBytes(16).toString("hex");
    try {
      const admin = await db.user.create({ data: { name: "Equipe de teste", email: "equipe@example.test", password: await hashPassword(password), role: "ADMIN" } });
      await db.user.create({ data: { name: "Atendimento de teste", email: "atendimento@example.test", password: await hashPassword(password), role: "USER" } });
      const shift = await db.shift.create({ data: { openKey: 1, openedBy: admin.id } });
      const product = await db.product.create({ data: { name: "Chope de teste", description: "Exclusivo de testes", unit: "un", price: "12.50", mark: "", stockAmount: 100 } });
      await db.product.create({ data: { name: "Porção de teste", description: "Exclusivo de testes", unit: "un", price: "38.00", mark: "", stockAmount: 100 } });
      for (const [index, name] of ["Cliente exemplo A", "Cliente exemplo B", "Cliente exemplo C", "Cliente exemplo D"].entries()) {
        const customer = await db.customer.create({ data: { name } });
        await db.order.create({ data: {
          customerId: customer.id, shiftId: index === 2 ? null : shift.id, totalAmount: index === 3 ? 25 : 12.5,
          state: index === 1 ? "CHECKOUT" : index === 3 ? "PAID" : "OPEN",
          paymentStatus: index === 3 ? "PAID" : "PENDING", paymentDate: index === 3 ? new Date() : null,
          paymentShiftId: index === 3 ? shift.id : null, paymentMethod: index === 3 ? "CASH" : null,
          items: { create: { productId: product.id, quantity: index === 3 ? 2 : 1, unit: "un", price: "12.50" } },
        } });
      }
    } finally { await db.$disconnect(); }
    console.log(`Fixture de teste temporária: equipe@example.test / ${password}`);
    console.log("URL de teste: http://localhost:3100");
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], {
      env: { ...process.env, PIX_KEY: "teste@example.test", PIX_NAME: "BAR DE TESTE", PIX_CITY: "SAO PAULO" },
      stdio: "inherit",
    });
    child.once("exit", () => { void cleanup(); });
  } catch {
    console.error("Falha ao iniciar ambiente de navegador isolado; detalhes de conexão omitidos.");
    await cleanup();
    process.exitCode = 1;
  }
}
void main();
