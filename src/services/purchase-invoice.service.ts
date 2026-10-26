import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { canWrite } from "@/lib/access";
import { BusinessError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/audit";
import { orderAccessWhere } from "@/server/order-access";
import { purchaseInvoiceSchema } from "@/validations/purchase-create.schema";
import { createProductsInTransaction } from "./inventory.service";
import { postTransactionEffects, prepareTransaction } from "./transaction.service";

export async function importPurchaseInvoice(input: unknown, user: CurrentUser) {
  const scope = orderAccessWhere(user, "purchasing", true);
  const { importKey, ...data } = purchaseInvoiceSchema.parse(input);
  const newInputs = data.items.flatMap(item => item.newProduct ? [item.newProduct] : []);
  if (newInputs.length && !canWrite(user.role, "inventory")) throw new BusinessError("Your role does not allow creating products.", 403);
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const lockHex = createHash("sha256").update(`${user.id}:${importKey}`).digest("hex").slice(0, 16);
  const lockKey = BigInt.asIntN(64, BigInt(`0x${lockHex}`));

  return prisma.$transaction(async tx => {
    // The lock and serializable transaction prevent retries from receiving stock twice.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lockKey}::bigint)`;
    const previous = await tx.audit_logs.findFirst({
      where: { actor_id: user.id, action: "PURCHASE_RECEIVED", entity_type: "PURCHASE_ORDER", after: { path: ["import_key"], equals: importKey } },
      select: { entity_id: true, after: true },
    });
    if (previous?.entity_id) {
      const purchase = await tx.purchase_orders.findUnique({ where: { id: previous.entity_id, ...scope, created_by: user.id, status: "RECEIVED" }, select: { id: true } });
      if (!purchase) throw new BusinessError("The previously saved invoice could not be verified. Review your purchase history before retrying.", 409);
      const snapshot = previous.after;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.import_hash !== hash) throw new BusinessError(`This invoice import was already saved as purchase #${purchase.id}. Review that purchase before starting another import.`, 409);
      return { id: purchase.id.toString(), status: "RECEIVED" };
    }

    const products = await createProductsInTransaction(tx, newInputs, user);
    let nextProduct = 0;
    const resolved = data.items.map(item => {
      const productId = item.newProduct ? products[nextProduct++]?.id.toString() : item.productId;
      if (!productId) throw new BusinessError("A product could not be prepared. Review all invoice lines.", 400);
      return { productId, quantity: item.quantity, unitPrice: item.unitPrice };
    });
    const { partyId, items, total, date } = await prepareTransaction(tx, "purchasing", { partyId: data.partyId, date: data.date, items: resolved }, user);
    const row = await tx.purchase_orders.create({ data: { supplier_id: partyId, created_by: user.id, purchase_date: date, status: "RECEIVED", total_amount: total, purchase_items: { create: items } } });
    await recordAudit(tx, user, { action: "PURCHASE_CREATED", entity: "PURCHASE_ORDER", entityId: row.id, after: { ...row, purchase_items: items } });
    await postTransactionEffects(tx, "purchasing", row.id, items, total, user, true);
    await recordAudit(tx, user, { action: "PURCHASE_RECEIVED", entity: "PURCHASE_ORDER", entityId: row.id, before: null, after: { status: "RECEIVED", total_amount: total, import_key: importKey, import_hash: hash } });
    return { id: row.id.toString(), status: "RECEIVED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
}
