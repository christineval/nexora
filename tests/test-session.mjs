import { createHash, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
export async function sessionFor(role) {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.users.findFirst({ where: { role }, select: { id: true, password_hash: true } });
    if (!user) throw new Error("No existing test actor with role " + role);
    const payload = Buffer.from(JSON.stringify({ id: user.id.toString(), expires: Date.now() + 300000, fingerprint: createHash("sha256").update(user.password_hash).digest("hex") })).toString("base64url");
    const signature = createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
    return { name: "nexora_session", value: payload + "." + signature, url: "http://localhost:3000", httpOnly: true, sameSite: "Lax" };
  } finally { await prisma.$disconnect(); }
}
