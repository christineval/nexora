import "server-only";
import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";

export type AuditEntity = "AUTH" | "USER" | "PRODUCT" | "CUSTOMER" | "SUPPLIER" | "ORDER" | "PURCHASE_ORDER" | "INVENTORY_MOVEMENT" | "LEDGER" | "ACCESS";
type AuditEvent = {
  action: string;
  entity: AuditEntity;
  entityId?: bigint;
  outcome?: "SUCCESS" | "FAILURE" | "DENIED";
  before?: unknown;
  after?: unknown;
};

// Only business fields enter history. Credentials and contact details are never serialized.
const fields = new Set(["id", "name", "role", "sku", "supplier_product_code", "size", "status", "stock_qty", "unit_cost", "selling_price", "customer_id", "supplier_id", "order_date", "purchase_date", "subtotal", "tax", "total_amount", "order_items", "purchase_items", "product_id", "quantity", "unit_price", "line_total", "type", "reference_type", "reference_id", "account_name", "entry_type", "amount", "module", "operation", "reason", "changed_fields", "session_count", "import_key", "import_hash"]);
export function auditSnapshot(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(auditSnapshot);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => fields.has(key)).map(([key, entry]) => [key, auditSnapshot(entry)]));
  return null;
}

function auditData(user: CurrentUser | null, event: AuditEvent) {
  return {
    actor_id: user?.id ?? null, actor_name: user?.name ?? "Unknown", actor_role: user?.role ?? null,
    action: event.action, entity_type: event.entity, entity_id: event.entityId,
    outcome: event.outcome ?? "SUCCESS",
    before: auditSnapshot(event.before) ?? Prisma.DbNull, after: auditSnapshot(event.after) ?? Prisma.DbNull,
  };
}

export async function recordAudit(tx: Prisma.TransactionClient, actor: CurrentUser | bigint | null, event: AuditEvent) {
  const user = typeof actor === "bigint" ? await tx.users.findUnique({ where: { id: actor }, select: { id: true, name: true, role: true } }) : actor;
  if (typeof actor === "bigint" && !user) throw new Error("Audit actor not found");
  await tx.audit_logs.create({ data: auditData(user, event) });
}

export async function recordAudits(tx: Prisma.TransactionClient, actor: CurrentUser, events: AuditEvent[]) {
  if (events.length) await tx.audit_logs.createMany({ data: events.map(event => auditData(actor, event)) });
}

export async function recordSecurityEvent(actor: CurrentUser | null, event: AuditEvent) {
  if (actor?.role === "GUEST") return;
  const { prisma } = await import("@/lib/prisma");
  await recordAudit(prisma, actor, event);
}
