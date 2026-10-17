import { loadTs } from "./load-ts.mjs";
import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
export async function sessionFor(role) {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.users.findFirst({ where: { role }, select: { id: true, password_hash: true } });
    if (!user) throw new Error("No existing test actor with role " + role);
    const { issueSession } = loadTs("src/lib/session-store.ts", { "@/lib/prisma": { prisma } });
    const token = await issueSession(user.id, user.password_hash);
    return { name: "nexora_session", value: token, url: "http://localhost:3000", httpOnly: true, sameSite: "Lax" };
  } finally { await prisma.$disconnect(); }
}
