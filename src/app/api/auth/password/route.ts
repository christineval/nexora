import { z } from "zod";
import { api, checkOrigin, readJson } from "@/lib/api";
import { getCurrentUser, createSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { userSchema } from "@/validations/user.schema";
import { BusinessError } from "@/lib/errors";
import { consumeLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/server/audit";
export async function POST(request: Request) {
  return api(request, async () => {
    checkOrigin(request);
    const current = await getCurrentUser(); if (!current) throw new BusinessError("Please sign in.", 401);
    if (current.role === "GUEST") throw new BusinessError("Guest access is read-only.", 403);
    await consumeLimit(`password:${current.id}`, 5, 15 * 60);
    const { prisma } = await import("@/lib/prisma");
    const data = z.object({ currentPassword: z.string().min(1).max(72), password: userSchema.shape.password, confirmPassword: z.string() }).refine(data => data.password === data.confirmPassword, "New passwords must match.").parse(await readJson(request));
    const user = await prisma.users.findUnique({ where: { id: current.id } });
    if (!user || !await verifyPassword(data.currentPassword, user.password_hash)) throw new BusinessError("Current password is incorrect.", 400);
    const digest = await hashPassword(data.password);
    await prisma.$transaction(async tx => {
      const updated = await tx.users.updateMany({ where: { id: user.id, password_hash: user.password_hash }, data: { password_hash: digest, updated_at: new Date() } });
      if (updated.count !== 1) throw new BusinessError("Your password changed. Sign in again.", 409);
      const revoked = await tx.user_sessions.deleteMany({ where: { user_id: user.id } });
      await recordAudit(tx, current, { action: "PASSWORD_CHANGED", entity: "USER", entityId: user.id });
      await recordAudit(tx, current, { action: "SESSION_REVOKED", entity: "AUTH", entityId: user.id, after: { reason: "Password changed", session_count: revoked.count } });
    });
    await createSession(user.id, digest);
    return { message: "Password updated." };
  });
}
