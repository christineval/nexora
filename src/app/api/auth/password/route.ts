import { z } from "zod";
import { api, checkOrigin } from "@/lib/api";
import { getCurrentUser, createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { userSchema } from "@/validations/user.schema";
import { BusinessError } from "@/lib/errors";
export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    const current = await getCurrentUser(); if (!current) throw new BusinessError("Please sign in.", 401);
    if (current.role === "GUEST") throw new BusinessError("Guest access is read-only.", 403);
    const data = z.object({ currentPassword: z.string().min(1).max(72), password: userSchema.shape.password, confirmPassword: z.string() }).refine(data => data.password === data.confirmPassword, "New passwords must match.").parse(await request.json());
    const user = await prisma.users.findUnique({ where: { id: current.id } });
    if (!user || !await verifyPassword(data.currentPassword, user.password_hash)) throw new BusinessError("Current password is incorrect.", 400);
    const digest = await hashPassword(data.password);
    const updated = await prisma.users.updateMany({ where: { id: user.id, password_hash: user.password_hash }, data: { password_hash: digest, updated_at: new Date() } });
    if (updated.count !== 1) throw new BusinessError("Your password changed. Sign in again.", 409);
    await createSession(user.id, digest);
    return { message: "Password updated." };
  });
}
