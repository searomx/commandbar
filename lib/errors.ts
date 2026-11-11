import { Prisma } from "@/app/generated/prisma/client";

export class AppError extends Error {}

export function publicError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNEXPECTED";
  console.error("[commandbar] Operação falhou", { code, kind: error instanceof Error ? error.name : "unknown" });
  if (code === "P2002") return "Este registro já existe. Atualize o painel e tente novamente.";
  if (code === "P2025") return "O registro não foi encontrado. Atualize o painel.";
  if (code === "P2034") return "Outra operação alterou esta conta. Atualize e tente novamente.";
  return "Não foi possível concluir a operação. Verifique a conexão e tente novamente.";
}
