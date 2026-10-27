import "server-only";
import { prisma } from "@/lib/prisma";
import { canWrite } from "@/lib/access";
import type { CurrentUser } from "@/lib/auth";
import { BusinessError } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
import { consumeLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/server/audit";
import { idSchema } from "@/validations/shared";
import { deleteProductSchema, productLifecycleSchema } from "@/validations/product-lifecycle.schema";

function requireInventoryWrite(user: CurrentUser) {
  if (!canWrite(user.role, "inventory")) throw new BusinessError("Your role does not allow this operation.", 403);
}

export async function changeProductLifecycle(recordId: string, input: unknown, user: CurrentUser) {
  requireInventoryWrite(user);
  const id = BigInt(idSchema.parse(recordId));
  const data = productLifecycleSchema.parse(input);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    const before = await tx.products.findUnique({ where: { id } });
    if (!before) throw new BusinessError("Product not found.", 404);
    const status = data.action === "archive" ? "INACTIVE" : "ACTIVE";
    if (data.action === "archive" && before.status !== "ACTIVE") throw new BusinessError("This product is already archived.", 409);
    if (data.action === "restore" && before.status === "ACTIVE") throw new BusinessError("This product is already active.", 409);
    if (data.action === "archive" && before.stock_qty > 0 && !data.acknowledgeStock) {
      throw new BusinessError(`This product has ${before.stock_qty} units in stock. Acknowledge the stock warning before archiving.`, 409);
    }
    const row = await tx.products.update({ where: { id }, data: { status, updated_at: new Date() } });
    await recordAudit(tx, user, { action: data.action === "archive" ? "PRODUCT_ARCHIVED" : "PRODUCT_RESTORED", entity: "PRODUCT", entityId: id, before, after: row });
    return { id: id.toString() };
  }, { isolationLevel: "Serializable" });
}

export async function permanentlyDeleteProduct(recordId: string, input: unknown, user: CurrentUser) {
  if (user.role !== "ADMIN") throw new BusinessError("Only an administrator can permanently delete products.", 403);
  const id = BigInt(idSchema.parse(recordId));
  const { password } = deleteProductSchema.parse(input);
  await consumeLimit(`product-delete-password:${user.id}`, 5, 15 * 60);
  const admin = await prisma.users.findUnique({ where: { id: user.id }, select: { id: true, role: true, password_hash: true } });
  if (!admin || admin.role !== "ADMIN") throw new BusinessError("Only an administrator can permanently delete products.", 403);
  if (!await verifyPassword(password, admin.password_hash)) throw new BusinessError("Your current password is incorrect. Product was not deleted.", 400);
  return prisma.$transaction(async tx => {
    // Keep password/role changes and new product references from racing deletion.
    const actors = await tx.$queryRaw<Array<{ role: string; password_hash: string }>>`SELECT role, password_hash FROM users WHERE id = ${user.id} FOR SHARE`;
    if (actors[0]?.role !== "ADMIN" || actors[0]?.password_hash !== admin.password_hash) throw new BusinessError("Your account changed. Sign in again before deleting.", 409);
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    const product = await tx.products.findUnique({ where: { id }, include: { _count: { select: { order_items: true, purchase_items: true, inventory_movements: true } } } });
    if (!product) throw new BusinessError("Product not found.", 404);
    if (product.status === "ACTIVE") throw new BusinessError("Archive this product before permanently deleting it.", 409);
    if (product.stock_qty !== 0) throw new BusinessError("Cannot delete a product with current inventory. Use Stock Movements to reconcile stock first.", 409);
    if (product._count.order_items) throw new BusinessError("Cannot delete a product with sales history. Keep it archived.", 409);
    if (product._count.purchase_items) throw new BusinessError("Cannot delete a product with purchase history. Keep it archived.", 409);
    if (product._count.inventory_movements) throw new BusinessError("Cannot delete a product with stock movements. Keep it archived.", 409);
    await tx.products.delete({ where: { id } });
    await recordAudit(tx, user, { action: "PRODUCT_DELETED", entity: "PRODUCT", entityId: id, before: product });
    return { id: id.toString() };
  }, { isolationLevel: "Serializable" });
}
