import "server-only";
import { recordAudit } from "@/server/audit";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BusinessError } from "@/lib/errors";
import { adjustmentSchema } from "@/validations/inventory.schema";
import { inventoryCostChange } from "@/server/inventory-cost";
export async function adjustStock(input: unknown, userId: bigint) {
  const data = adjustmentSchema.parse(input);
  const id = BigInt(data.productId);
  const outgoing = data.type === "ADJUSTMENT_OUT";
  return prisma.$transaction(async tx => {
    const before = await tx.products.findUnique({ where: { id } });
    if (!before || before.status !== "ACTIVE") throw new BusinessError("Select an active product.");
    const cost = inventoryCostChange(before, data.quantity, outgoing ? "out" : "in");
    const result = await tx.products.updateMany({ where: { id, status: "ACTIVE", inventory_value: before.inventory_value, stock_qty: outgoing ? { gte: data.quantity } : { lte: 2147483647 - data.quantity } }, data: { stock_qty: outgoing ? { decrement: data.quantity } : { increment: data.quantity }, inventory_value: cost.value, unit_cost: cost.averageCost, updated_at: new Date() } });
    if (result.count !== 1) throw new BusinessError("The product is inactive, has insufficient stock, or the adjustment exceeds the supported stock quantity.");
    const movement = await tx.inventory_movements.create({ data: { product_id: id, type: data.type, quantity: data.quantity, cost_amount: cost.amount, reference_type: "ADJUSTMENT", created_by: userId } });
    await recordAudit(tx, userId, { action: "STOCK_ADJUSTED", entity: "INVENTORY_MOVEMENT", entityId: movement.id, before, after: { ...movement, stock_qty: cost.stock, inventory_value: cost.value } });
    return { id: movement.id.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
