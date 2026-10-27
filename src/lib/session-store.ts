import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { BusinessError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";

export const SESSION_SECONDS = 60 * 60;
export function sessionDigest(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function issueSession(userId: bigint, passwordHash: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async tx => {
    // Serialize logins for this user so concurrent logins cannot exceed the cap.
    const users = await tx.$queryRaw<Array<{ password_hash: string }>>`SELECT password_hash FROM users WHERE id = ${userId} FOR UPDATE`;
    if (users[0]?.password_hash !== passwordHash) throw new BusinessError("Your password changed. Sign in again.", 401);
    const now = new Date();
    await tx.user_sessions.deleteMany({ where: { user_id: userId, OR: [{ expires_at: { lte: now } }, { password_fingerprint: { not: sessionDigest(passwordHash) } }] } });
    const active = await tx.user_sessions.findMany({ where: { user_id: userId }, orderBy: [{ created_at: "desc" }, { token_hash: "desc" }], select: { token_hash: true } });
    if (active.length >= 3) await tx.user_sessions.deleteMany({ where: { token_hash: { in: active.slice(2).map(row => row.token_hash) } } });
    if (active.length >= 3) await recordAudit(tx, userId, { action: "SESSION_REVOKED", entity: "AUTH", entityId: userId, after: { reason: "Active session limit", session_count: active.length - 2 } });
    await tx.user_sessions.create({ data: { token_hash: sessionDigest(token), user_id: userId, password_fingerprint: sessionDigest(passwordHash), created_at: now, expires_at: new Date(now.getTime() + SESSION_SECONDS * 1000) } });
    await recordAudit(tx, userId, { action: "LOGIN_SUCCEEDED", entity: "AUTH", entityId: userId });
  });
  return token;
}

export async function readSession(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await prisma.user_sessions.findUnique({ where: { token_hash: sessionDigest(token) }, include: { users: { select: { id: true, name: true, role: true, password_hash: true } } } });
  if (!session || session.expires_at.getTime() <= Date.now() || session.password_fingerprint !== sessionDigest(session.users.password_hash)) return null;
  return { id: session.users.id, name: session.users.name, role: session.users.role };
}

export async function revokeSession(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await prisma.$transaction(async tx => {
    const session = await tx.user_sessions.findUnique({ where: { token_hash: sessionDigest(token) } });
    if (!session) return;
    const deleted = await tx.user_sessions.deleteMany({ where: { token_hash: session.token_hash } });
    if (deleted.count) await recordAudit(tx, session.user_id, { action: "LOGOUT", entity: "AUTH", entityId: session.user_id });
  });
}
