import "dotenv/config";
import { z } from "zod";
import { createDatabaseClient } from "../lib/database-client";
import { hashPassword } from "../lib/password";

const config = z.object({
  ADMIN_NAME: z.string().trim().min(2).max(30),
  ADMIN_EMAIL: z.email().max(50).transform((v) => v.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(12).max(200),
}).safeParse(process.env);

async function seed() {
  if (!config.success) {
    console.error("Defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) no ambiente. Nenhum dado foi alterado.");
    process.exitCode = 1;
    return;
  }
  const db = createDatabaseClient();
  try {
    const existing = await db.user.findFirst({ where: { email: { equals: config.data.ADMIN_EMAIL, mode: "insensitive" } } });
    if (existing) throw new Error("O administrador já existe. Este comando não substitui senhas existentes.");
    await db.user.create({ data: {
      name: config.data.ADMIN_NAME, email: config.data.ADMIN_EMAIL,
      password: await hashPassword(config.data.ADMIN_PASSWORD), role: "ADMIN",
    } });
    console.log("Administrador criado com senha protegida. Nenhum produto ou cliente foi inserido.");
  } finally { await db.$disconnect(); }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error && error.message === "O administrador já existe. Este comando não substitui senhas existentes."
    ? error.message : "Não foi possível criar o administrador. Verifique a conexão e as migrações.");
  process.exitCode = 1;
});
