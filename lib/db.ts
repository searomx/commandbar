import { PrismaClient } from "@/app/generated/prisma/client";
import { createDatabaseClient } from "@/lib/database-client";

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  createDatabaseClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
