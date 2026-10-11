import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BusinessError } from "@/lib/errors";
import { adjustmentSchema } from "@/validations/inventory.schema";
export async function adjustStock(input: unknown, userId: bigint) {
  const data = adjustmentSchema.parse(input);
  const id = BigInt(data.productId);
  const outgoing = data.type === "ADJUSTMENT_OUT";
  return prisma.$transaction(async tx => {
    const result = await tx.products.updateMany({ where: { id, status: "ACTIVE", stock_qty: outgoing ? { gte: data.quantity } : { lte: 2147483647 - data.quantity } }, data: { stock_qty: outgoing ? { decrement: data.quantity } : { increment: data.quantity }, updated_at: new Date() } });
    if (result.count !== 1) throw new BusinessError("The product is inactive, has insufficient stock, or the adjustment exceeds the supported stock quantity.");
    const movement = await tx.inventory_movements.create({ data: { product_id: id, type: data.type, quantity: data.quantity, reference_type: "ADJUSTMENT", created_by: userId } });
    return { id: movement.id.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
