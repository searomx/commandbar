import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPix, crc16 } from "../lib/pix";
import { commandSchema, customerSchema, loginSchema } from "../lib/validation";
import { hashPassword, verifyPassword } from "../lib/password";
import { orderDate } from "../lib/contracts";

test("data da comanda usa o horário de Brasília", () => {
  assert.equal(orderDate("2026-11-13T02:59:00.000Z"), "12/11/2026");
  assert.equal(orderDate("2026-11-13T03:00:00.000Z"), "13/11/2026");
});

test("senhas usam salt, hash e comparação segura; texto puro não é aceito", async () => {
  const password = "Teste-seguro-123!";
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.notEqual(await hashPassword(password), hash);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("Outra senha", hash), false);
  assert.equal(await verifyPassword(password, password), false);
});

test("cliente e login têm validação e normalização", () => {
  assert.equal(customerSchema.safeParse({ name: "A", phone: "" }).success, false);
  assert.equal(customerSchema.safeParse({ name: "Ana", phone: "123" }).success, false);
  assert.equal(customerSchema.safeParse({ name: "Ana", phone: "(11) 99999-9999" }).success, true);
  assert.equal(customerSchema.parse({ name: " Ana ", phone: "" }).name, "Ana");
  assert.equal(loginSchema.parse({ email: "ADMIN@EXAMPLE.COM", password: "x" }).email, "admin@example.com");
});

test("quantidades aceitam vírgula e rejeitam zero, negativos e excesso de precisão", () => {
  const base = { type: "item", orderId: 1, productId: 2 } as const;
  const result = commandSchema.parse({ ...base, quantity: "1,25" });
  assert.ok("quantity" in result);
  assert.equal(result.quantity, "1.25");
  for (const quantity of ["0", "-1", "1.001", "NaN", "100000", "1e2"]) {
    assert.equal(commandSchema.safeParse({ ...base, quantity }).success, false);
  }
  assert.equal(commandSchema.safeParse({ type: "pay", orderId: 1, method: "PIX" }).success, false);
});

test("Pix contém valor, referência e CRC16 verificável", () => {
  assert.equal(crc16("123456789"), "29B1");
  const payload = buildPix({ key: "pix@example.com", name: "Bar São João", city: "São Paulo" }, "123.45", 42);
  assert.ok(payload.includes("5406123.45"));
  assert.ok(payload.includes("BAR SAO JOAO"));
  assert.ok(payload.includes("CMD42"));
  assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
  assert.throws(() => buildPix({}, "123.45", 1), /Pix indisponível/);
  assert.throws(() => buildPix({ key: "pix@example.com", name: "Bar", city: "SP" }, "0.00", 1), /maior que zero/);
});
