import { z } from "zod";
import { api, checkOrigin } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { BusinessError } from "@/lib/errors";

const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    const data = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(72) }).parse(await request.json());
    const key = data.email.toLowerCase();
    const now = Date.now();
    for (const [email, entry] of attempts) if (entry.until <= now) attempts.delete(email);
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
    if (entry.count >= 5 || attempts.size >= 10000) throw new BusinessError("Too many sign-in attempts. Try again in 15 minutes.", 429);
    entry.count++;
    attempts.set(key, entry);
    const user = await prisma.users.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } } });
    const valid = await verifyPassword(data.password, user?.password_hash ?? "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxgDqiHHdTMqYF5rOStULM1iS6e");
    if (!user || !valid) throw new BusinessError("Email or password is incorrect.", 401);
    await createSession(user.id, user.password_hash);
    attempts.delete(key);
    return { message: "Signed in." };
  });
}
