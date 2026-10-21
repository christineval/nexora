import "server-only";
import { recordAudit } from "@/server/audit";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { BusinessError } from "@/lib/errors";
import { userSchema, updateUserSchema } from "@/validations/user.schema";
import { idSchema } from "@/validations/shared";
import type { UserRow } from "@/types/features";
export async function listUsers(): Promise<UserRow[]> {
  const rows = await prisma.users.findMany({ select: { id: true, name: true, email: true, role: true, created_at: true }, orderBy: { name: "asc" } });
  return rows.map(row => ({ id: row.id.toString(), name: row.name, email: row.email, role: row.role, timestamp: row.created_at.toISOString() }));
}
export async function saveUser(input: unknown, actorId: bigint, recordId?: string) {
  if (!recordId) {
    const data = userSchema.parse(input);
    const digest = await hashPassword(data.password);
    return prisma.$transaction(async tx => {
      const row = await tx.users.create({ data: { name: data.name, email: data.email.toLowerCase(), role: data.role, password_hash: digest }, select: { id: true, name: true, role: true } });
      await recordAudit(tx, actorId, { action: "USER_CREATED", entity: "USER", entityId: row.id, after: row });
      return { id: row.id.toString() };
    });
  }
  const id = BigInt(idSchema.parse(recordId));
  const data = updateUserSchema.parse(input);
  if (id === actorId && data.role !== "ADMIN") throw new BusinessError("You cannot remove your own administrator access.");
  return prisma.$transaction(async tx => {
    const existing = await tx.users.findUnique({ where: { id }, select: { name: true, email: true, role: true } });
    if (!existing) throw new BusinessError("User not found.", 404);
    if (existing.role === "ADMIN" && data.role !== "ADMIN" && await tx.users.count({ where: { role: "ADMIN" } }) <= 1) throw new BusinessError("Keep at least one administrator.");
    const actor = await tx.users.findUniqueOrThrow({ where: { id: actorId }, select: { id: true, name: true, role: true } });
    const row = await tx.users.update({ where: { id }, data: { ...data, email: data.email.toLowerCase(), updated_at: new Date() } });
    await recordAudit(tx, actor, { action: existing.role !== row.role ? "USER_ROLE_CHANGED" : "USER_UPDATED", entity: "USER", entityId: id, before: existing, after: { ...row, changed_fields: Object.keys(data).filter(key => existing[key as keyof typeof existing] !== data[key as keyof typeof data]) } });
    return { id: id.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
