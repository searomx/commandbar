import "dotenv/config";
import { createDatabaseClient } from "../lib/database-client";
import { hashPassword } from "../lib/password";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!connectionString) throw new Error("DATABASE_URL obrigatoria para executar o seed.");
  if (!password) throw new Error("SEED_ADMIN_PASSWORD obrigatoria para executar o seed.");

  const prisma = createDatabaseClient();

  try {
    const adminPassword = await hashPassword(password);

    await prisma.user.upsert({
      where: { email: "searomx@gmail.com" },
      update: {},
      create: {
        email: "searomx@gmail.com",
        name: "master",
        password: adminPassword,
        role: "ADMIN",
      },
    });

    console.log("Seed do administrador concluido.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Erro ao executar o seed:", error);
  process.exitCode = 1;
});