import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { AppError } from "@/lib/errors";
import type { Employee } from "@/lib/contracts";

const COOKIE = "commandbar_session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const employeeSelect = { id: true, name: true, role: true } as const;

export async function currentUser(): Promise<Employee | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    select: { expiresAt: true, user: { select: employeeSelect } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError("Sua sessão expirou. Entre novamente para continuar.");
  return user;
}

export async function authenticate(email: string, password: string) {
  const key = hash(email.toLowerCase());
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const now = new Date();
    const attempt = await tx.loginAttempt.findUnique({ where: { key } });
    if (attempt?.blockedUntil && attempt.blockedUntil > now) return { blocked: true, user: null };
    const user = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    const valid = await verifyPassword(password, user?.password ?? "");
    if (valid && user) {
      await tx.loginAttempt.deleteMany({ where: { key } });
      return { blocked: false, user: { id: user.id, name: user.name, role: user.role } };
    }
    const recent = attempt && now.getTime() - attempt.startedAt.getTime() < 15 * 60_000;
    const attempts = recent ? attempt.attempts + 1 : 1;
    await tx.loginAttempt.upsert({
      where: { key },
      create: { key, attempts: 1, startedAt: now },
      update: {
        attempts, startedAt: recent ? attempt.startedAt : now,
        blockedUntil: attempts >= 5 ? new Date(now.getTime() + 15 * 60_000) : null,
      },
    });
    return { blocked: attempts >= 5, user: null };
  }, { timeout: 15_000 });
  if (result.blocked) throw new AppError("Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.");
  if (!result.user) throw new AppError("E-mail ou senha incorretos.");
  return result.user;
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60_000);
  await db.session.create({ data: { tokenHash: hash(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    expires: expiresAt, path: "/",
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  store.delete(COOKIE);
}
