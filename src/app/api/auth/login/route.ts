import { z } from "zod";
import { api, checkOrigin, readJson } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { BusinessError } from "@/lib/errors";

import { consumeLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  return api(request, async () => {
    checkOrigin(request);
    const data = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(72) }).parse(await readJson(request));
    await consumeLimit(`login:${data.email.toLowerCase()}`, 5, 15 * 60);
    const user = await prisma.users.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } } });
    const valid = await verifyPassword(data.password, user?.password_hash ?? "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxgDqiHHdTMqYF5rOStULM1iS6e");
    if (!user || !valid) throw new BusinessError("Email or password is incorrect.", 401);
    await createSession(user.id, user.password_hash);
    return { message: "Signed in." };
  });
}
