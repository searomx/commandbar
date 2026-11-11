import "server-only";
import nodemailer from "nodemailer";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AppError } from "./errors";
import { renderDailyReport, type DailyReport } from "./daily-report";

const smtpSchema = z.object({
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: z.enum(["true", "false"]),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  SMTP_FROM: z.email(),
  SMTP_CA_FILE: z.string().min(1).optional(),
});

export async function sendDailyReport(report: DailyReport, recipient: string) {
  const config = smtpSchema.safeParse(process.env);
  if (!config.success) throw new AppError("Configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD e SMTP_FROM antes de encerrar o turno.");
  if (!z.email().safeParse(recipient).success) throw new AppError("O e-mail do administrador é inválido. Corrija o cadastro antes de encerrar o turno.");
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_CA_FILE } = config.data;
  let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    const ca = SMTP_CA_FILE ? await readFile(SMTP_CA_FILE) : undefined;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE === "true",
      requireTLS: SMTP_SECURE === "false",
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      ...(ca ? { tls: { ca } } : {}),
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
    const pdf = await renderDailyReport(report);
    const info = await transporter.sendMail({
      from: SMTP_FROM, to: recipient,
      subject: `Relatório Diário de Movimentação - ${report.day.label}`,
      text: `Segue em anexo o relatório diário de movimentação de ${report.day.label}.`,
      attachments: [{ filename: `relatorio-${report.day.key}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    if (info.accepted.length !== 1 || info.rejected.length !== 0) throw new Error("Destinatário não aceito pelo servidor SMTP.");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code)
      ? error.code : "UNKNOWN";
    console.error("[commandbar] Falha ao gerar ou enviar relatório", { kind: error instanceof Error ? error.name : "unknown", code });
    throw new AppError("Não foi possível gerar ou enviar o relatório. O turno continua aberto; verifique o SMTP e tente novamente.");
  } finally {
    transporter?.close();
  }
}
