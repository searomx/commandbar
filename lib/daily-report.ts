import { Prisma } from "../app/generated/prisma/client";
import PDFDocument from "pdfkit";

const timeZone = "America/Sao_Paulo";
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit",
});

function firstInstantOfDay(key: string, near: number): Date {
  let low = near - 48 * 60 * 60 * 1000;
  let high = near + 48 * 60 * 60 * 1000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (dateKeyFormatter.format(new Date(mid)) < key) low = mid + 1;
    else high = mid;
  }
  return new Date(low);
}

export function reportDay(date: Date) {
  const key = dateKeyFormatter.format(date);
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = next.toISOString().slice(0, 10);
  return {
    start: firstInstantOfDay(key, date.getTime()),
    end: firstInstantOfDay(nextKey, date.getTime()),
    label: dateFormatter.format(date),
    key,
  };
}

type ReportOrder = {
  customerId: number;
  customer: { name: string };
  createdAt: Date;
  totalAmount: Prisma.Decimal;
  paymentStatus: "PENDING" | "PAID" | "FAILED";
};

export function buildDailyReport(date: Date, userName: string, orders: ReportOrder[]) {
  const grouped = new Map<string, { date: string; name: string; status: "Pago" | "Pendente"; total: Prisma.Decimal }>();
  for (const order of orders) {
    const status = order.paymentStatus === "PAID" ? "Pago" : "Pendente";
    const key = `${order.customerId}:${status}`;
    const group = grouped.get(key);
    if (group) group.total = group.total.add(order.totalAmount);
    else grouped.set(key, {
      date: dateFormatter.format(order.createdAt), name: order.customer.name, status, total: order.totalAmount,
    });
  }
  const rows = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.status.localeCompare(b.status, "pt-BR"));
  const total = rows.reduce((sum, row) => sum.add(row.total), new Prisma.Decimal(0));
  return { day: reportDay(date), userName, rows, total };
}

export type DailyReport = ReturnType<typeof buildDailyReport>;

function money(value: Prisma.Decimal): string {
  const [integer, cents] = value.toFixed(2).split(".");
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

export function renderDailyReport(report: DailyReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 45, bufferPages: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      const heading = () => {
        doc.font("Helvetica-Bold").fontSize(18).text("Relatório Diário de Movimentação");
        doc.moveDown(0.5).font("Helvetica").fontSize(10);
        doc.text(`Data: ${report.day.label}`);
        doc.text(`Usuário: ${report.userName}`);
        doc.font("Helvetica-Bold").text(`Valor Total do Movimento: ${money(report.total)}`);
        doc.moveDown();
        const y = doc.y;
        doc.fontSize(9).text("Data", 45, y, { width: 75 });
        doc.text("Nome do Cliente", 120, y, { width: 210 });
        doc.text("Valor Despesa", 330, y, { width: 110, align: "right" });
        doc.text("Situação", 460, y, { width: 90 });
        doc.moveTo(45, y + 15).lineTo(550, y + 15).stroke();
        doc.y = y + 21;
      };
      heading();
      doc.font("Helvetica").fontSize(9);
      if (report.rows.length === 0) doc.text("Nenhuma comanda criada neste dia.");
      for (const row of report.rows) {
        const height = Math.max(16, doc.heightOfString(row.name, { width: 200 }) + 5);
        if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          heading();
          doc.font("Helvetica").fontSize(9);
        }
        const y = doc.y;
        doc.text(row.date, 45, y, { width: 75 });
        doc.text(row.name, 120, y, { width: 200 });
        doc.text(money(row.total), 330, y, { width: 110, align: "right" });
        doc.text(row.status, 460, y, { width: 90 });
        doc.y = y + height;
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
