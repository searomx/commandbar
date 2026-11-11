import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFParse } from "pdf-parse";
import { Prisma } from "../app/generated/prisma/client";
import { buildDailyReport, renderDailyReport, reportDay } from "../lib/daily-report";

test("dia do relatório respeita o fuso de Brasília, inclusive horário de verão histórico", () => {
  const day = reportDay(new Date("2026-11-11T02:59:59Z"));
  assert.equal(day.label, "10/11/2026");
  assert.equal(day.start.toISOString(), "2026-11-10T03:00:00.000Z");
  assert.equal(day.end.toISOString(), "2026-11-11T03:00:00.000Z");
  const summer = reportDay(new Date("2018-11-04T15:00:00Z"));
  assert.equal(summer.start.toISOString(), "2018-11-04T03:00:00.000Z");
  assert.equal(summer.end.toISOString(), "2018-11-05T02:00:00.000Z");
});

test("relatório soma por cliente e situação com precisão e renderiza PDF paginado", async () => {
  const date = new Date("2026-11-11T12:00:00Z");
  const orders = [
    { customerId: 1, customer: { name: "João da Silva" }, createdAt: date, totalAmount: new Prisma.Decimal("0.10"), paymentStatus: "PENDING" as const },
    { customerId: 1, customer: { name: "João da Silva" }, createdAt: date, totalAmount: new Prisma.Decimal("0.20"), paymentStatus: "FAILED" as const },
    { customerId: 1, customer: { name: "João da Silva" }, createdAt: date, totalAmount: new Prisma.Decimal("12.34"), paymentStatus: "PAID" as const },
    ...Array.from({ length: 100 }, (_, index) => ({
      customerId: index + 2, customer: { name: `Cliente ${index}` }, createdAt: date,
      totalAmount: new Prisma.Decimal("1.00"), paymentStatus: "PAID" as const,
    })),
  ];
  const report = buildDailyReport(date, "Usuário logado", orders);
  assert.equal(report.rows.length, 102);
  assert.equal(report.rows.find((row) => row.name === "João da Silva" && row.status === "Pendente")?.total.toFixed(2), "0.30");
  assert.equal(report.total.toFixed(2), "112.64");
  const pdf = await renderDailyReport(report);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const parser = new PDFParse({ data: pdf });
  try {
    const result = await parser.getText();
    assert.ok(result.total > 1);
    for (const text of ["Relatório Diário de Movimentação", "11/11/2026", "Usuário logado", "112,64", "João da Silva", "0,30", "Pendente", "Pago", "Cliente 99"]) {
      assert.ok(result.text.includes(text), `Texto ausente no PDF: ${text}`);
    }
  } finally {
    await parser.destroy();
  }
});
