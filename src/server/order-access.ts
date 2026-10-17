import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { canAccess, canWrite, roles } from "@/lib/access";
import { BusinessError } from "@/lib/errors";
import type { TransactionKind } from "@/lib/workflow";

// Callers must supply the server-resolved session identity, never request data.
export function orderOwnershipWhere(user: CurrentUser): { created_by?: bigint } {
  if (!user || user.id <= 0n || !roles.some(role => role === user.role)) throw new BusinessError("Your role does not allow this operation.", 403);
  return user.role === "ADMIN" ? {} : { created_by: user.id };
}

export function orderAccessWhere(user: CurrentUser, kind: TransactionKind, write = false) {
  const scope = orderOwnershipWhere(user);
  const allowed = write ? canWrite(user.role, kind) : canAccess(user.role, kind) || canAccess(user.role, "reports");
  if (!allowed) throw new BusinessError("Your role does not allow this operation.", 403);
  return scope;
}
