import "server-only";
import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { BusinessError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { auditFilterSchema } from "@/validations/audit.schema";

export async function listAuditLogs(user: CurrentUser, input: unknown) {
  if (user.role !== "ADMIN") throw new BusinessError("Only administrators can view audit logs.", 403);
  const filters = auditFilterSchema.parse(input);
  const where: Prisma.audit_logsWhereInput = {
    actor_id: filters.actorId ? BigInt(filters.actorId) : undefined,
    action: filters.action, entity_type: filters.entity, outcome: filters.outcome,
    created_at: filters.from || filters.to ? {
      gte: filters.from ? new Date(filters.from + "T00:00:00+08:00") : undefined,
      lt: filters.to ? new Date(new Date(filters.to + "T00:00:00+08:00").getTime() + 86400000) : undefined,
    } : undefined,
  };
  return prisma.$transaction(async tx => {
    const total = await tx.audit_logs.count({ where });
    const pages = Math.max(1, Math.ceil(total / 25));
    const page = Math.min(filters.page, pages);
    const rows = await tx.audit_logs.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 });
    return { total, page, pages, rows: rows.map(row => ({ ...row, id: row.id.toString(), actor_id: row.actor_id?.toString() ?? null, entity_id: row.entity_id?.toString() ?? null, created_at: row.created_at.toISOString() })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
