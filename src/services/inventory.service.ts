import "server-only";
import { recordAudit } from "@/server/audit";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { InventoryMovementRow, ProductRow } from "@/types/views";
import type { CreateProductInput } from "@/validations/product.schema";
import { updateProductSchema } from "@/validations/product.schema";
import { idSchema } from "@/validations/shared";


export async function listProducts(): Promise<ProductRow[]> {
  const products = await prisma.products.findMany({ orderBy: { name: "asc" } });
  return products.map((product) => ({
    productId: product.id.toString(), sku: product.sku, name: product.name, size: product.size,
    stockQty: product.stock_qty, unitCost: product.unit_cost.toNumber(),
    sellingPrice: product.selling_price.toNumber(), status: product.status,
  }));
}


export async function getProduct(id: string): Promise<ProductRow | null> {
  const product = await prisma.products.findUnique({ where: { id: BigInt(idSchema.parse(id)) } });
  if (!product) return null;
  return { productId: product.id.toString(), sku: product.sku, name: product.name, size: product.size,
    stockQty: product.stock_qty, unitCost: product.unit_cost.toNumber(), sellingPrice: product.selling_price.toNumber(), status: product.status };
}


export async function listInventoryMovements(): Promise<InventoryMovementRow[]> {
  const movements = await prisma.inventory_movements.findMany({
    select: {
      id: true, created_at: true, product_id: true, type: true, quantity: true,
      reference_type: true, reference_id: true,
      products: { select: { name: true, sku: true } },
      users: { select: { name: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  return movements.map((movement) => ({
    id: movement.id.toString(), timestamp: movement.created_at.toISOString(),
    productId: movement.product_id.toString(), productName: movement.products.name,
    productSku: movement.products.sku, type: movement.type, quantity: movement.quantity,
    referenceType: movement.reference_type, referenceId: movement.reference_id?.toString() ?? null,
    createdBy: movement.users.name,
  }));
}


export async function getNextProductSku(): Promise<string> {
  const products = await prisma.products.findMany({
    where: { sku: { startsWith: "ERP-" } },
    select: { sku: true },
  });

  const lastNumber = products.reduce((highest, product) => {
    const match = /^ERP-(\d+)$/i.exec(product.sku);
    if (!match) return highest;
    return Math.max(highest, Number(match[1]));
  }, 0);

  return `ERP-${(lastNumber + 1).toString().padStart(4, "0")}`;
}


export async function createProduct(data: CreateProductInput, actorId: bigint) {
  return prisma.$transaction(tx => createProductInTransaction(tx, data, actorId));
}

export async function createProductInTransaction(tx: Prisma.TransactionClient, data: CreateProductInput, actorId: bigint) {
  const result = await tx.$queryRaw<Array<{ sku: string }>>`
    SELECT 'ERP-' || LPAD(value, GREATEST(4, LENGTH(value)), '0') AS sku
    FROM (SELECT nextval('public.product_sku_seq'::regclass)::text AS value) generated`;
  const sku = result[0]?.sku;
  if (!sku) throw new Error("Failed to generate SKU");

  const product = await tx.products.create({
    data: {
      sku,
      name: data.name,
      size: data.size || null,
      unit_cost: data.unitCost,
      selling_price: data.sellingPrice,
      stock_qty: 0,
      status: "ACTIVE",
    },
  });
  await recordAudit(tx, actorId, { action: "PRODUCT_CREATED", entity: "PRODUCT", entityId: product.id, after: product });
  return product;
}

export async function updateProduct(recordId: string, input: unknown, actorId: bigint) {
  const id = BigInt(idSchema.parse(recordId));
  const data = updateProductSchema.parse(input);
  return prisma.$transaction(async tx => {
    const before = await tx.products.findUnique({ where: { id } });
    const row = await tx.products.update({ where: { id }, data: { name: data.name, size: data.size || null, unit_cost: data.unitCost, selling_price: data.sellingPrice, status: data.status, updated_at: new Date() } });
    await recordAudit(tx, actorId, { action: "PRODUCT_UPDATED", entity: "PRODUCT", entityId: id, before, after: row });
    return { id: row.id.toString() };
  }, { isolationLevel: "Serializable" });
}
