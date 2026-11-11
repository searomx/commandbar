import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

export function createDatabaseClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Configure DATABASE_URL antes de iniciar o aplicativo.");
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
}
