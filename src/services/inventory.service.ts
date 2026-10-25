import "server-only";
import { recordAudit, recordAudits } from "@/server/audit";
import type { CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { InventoryMovementRow, ProductRow } from "@/types/views";
import type { CreateProductInput } from "@/validations/product.schema";
import { createProductRequestSchema, updateProductSchema } from "@/validations/product.schema";
import { idSchema } from "@/validations/shared";
import { BusinessError } from "@/lib/errors";
import { assertNoDuplicateProducts } from "@/server/record-duplicates";


export async function listProducts(): Promise<ProductRow[]> {
  const products = await prisma.products.findMany({ orderBy: { name: "asc" } });
  return products.map((product) => ({
    productId: product.id.toString(), sku: product.sku, supplierProductCode: product.supplier_product_code, name: product.name, size: product.size,
    stockQty: product.stock_qty, unitCost: product.unit_cost.toNumber(),
    sellingPrice: product.selling_price.toNumber(), status: product.status,
  }));
}


export async function getProduct(id: string): Promise<ProductRow | null> {
  const product = await prisma.products.findUnique({ where: { id: BigInt(idSchema.parse(id)) } });
  if (!product) return null;
  return { productId: product.id.toString(), sku: product.sku, supplierProductCode: product.supplier_product_code, name: product.name, size: product.size,
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


export async function createProduct(input: unknown, actorId: bigint) {
  const { quantity, ...data } = createProductRequestSchema.parse(input);
  return prisma.$transaction(tx => createProductInTransaction(tx, data, actorId, quantity), { isolationLevel: "Serializable" });
}

export async function createProductInTransaction(tx: Prisma.TransactionClient, data: CreateProductInput, actorId: bigint, initialQuantity = 0) {
  await assertNoDuplicateProducts(tx, [data]);
  const result = await tx.$queryRaw<Array<{ sku: string }>>`
    SELECT 'ERP-' || LPAD(value, GREATEST(4, LENGTH(value)), '0') AS sku
    FROM (SELECT nextval('public.product_sku_seq'::regclass)::text AS value) generated`;
  const sku = result[0]?.sku;
  if (!sku) throw new Error("Failed to generate SKU");

  const product = await tx.products.create({
    data: {
      sku,
      supplier_product_code: data.supplierProductCode || null,
      name: data.name,
      size: data.size || null,
      unit_cost: data.unitCost,
      selling_price: data.sellingPrice,
      stock_qty: initialQuantity,
      status: "ACTIVE",
    },
  });
  await recordAudit(tx, actorId, { action: "PRODUCT_CREATED", entity: "PRODUCT", entityId: product.id, after: product });
  if (initialQuantity > 0) {
    const movement = await tx.inventory_movements.create({ data: { product_id: product.id, type: "ADJUSTMENT_IN", quantity: initialQuantity, reference_type: "ADJUSTMENT", created_by: actorId } });
    await recordAudit(tx, actorId, { action: "STOCK_ADJUSTED", entity: "INVENTORY_MOVEMENT", entityId: movement.id, before: { stock_qty: 0 }, after: { ...movement, stock_qty: initialQuantity } });
  }
  return product;
}

export async function createProductsInTransaction(tx: Prisma.TransactionClient, inputs: CreateProductInput[], actor: CurrentUser) {
  if (!inputs.length) return [];
  await assertNoDuplicateProducts(tx, inputs);
  const generated = await tx.$queryRaw<Array<{ sku: string }>>`
    SELECT 'ERP-' || LPAD(value, GREATEST(4, LENGTH(value)), '0') AS sku
    FROM (SELECT ordinal, nextval('public.product_sku_seq'::regclass)::text AS value
      FROM generate_series(1, ${inputs.length}::int) AS series(ordinal)) generated
    ORDER BY ordinal`;
  if (generated.length !== inputs.length) throw new Error("Failed to generate product SKUs");
  const products = await tx.products.createManyAndReturn({ data: inputs.map((input, index) => ({
    sku: generated[index].sku, name: input.name, supplier_product_code: input.supplierProductCode || null,
    size: input.size || null, unit_cost: input.unitCost, selling_price: input.sellingPrice, stock_qty: 0, status: "ACTIVE",
  })) });
  const bySku = new Map(products.map(product => [product.sku, product]));
  const ordered = generated.map(({ sku }) => {
    const product = bySku.get(sku);
    if (!product) throw new Error("A created product is missing");
    return product;
  });
  await recordAudits(tx, actor, ordered.map(product => ({ action: "PRODUCT_CREATED", entity: "PRODUCT", entityId: product.id, after: product })));
  return ordered;
}

export async function updateProduct(recordId: string, input: unknown, actorId: bigint) {
  const id = BigInt(idSchema.parse(recordId));
  const data = updateProductSchema.parse(input);
  return prisma.$transaction(async tx => {
    const before = await tx.products.findUnique({ where: { id } });
    if (!before) throw new BusinessError("Product not found.", 404);
    if (data.status !== before.status) throw new BusinessError("Use the Archive or Restore action to change product availability.", 409);
    await assertNoDuplicateProducts(tx, [{ ...data, supplierProductCode: data.supplierProductCode ?? before.supplier_product_code }], id);
    const row = await tx.products.update({ where: { id }, data: { name: data.name, supplier_product_code: data.supplierProductCode === undefined ? undefined : data.supplierProductCode || null, size: data.size || null, unit_cost: data.unitCost, selling_price: data.sellingPrice, status: data.status, updated_at: new Date() } });
    await recordAudit(tx, actorId, { action: "PRODUCT_UPDATED", entity: "PRODUCT", entityId: id, before, after: row });
    return { id: row.id.toString() };
  }, { isolationLevel: "Serializable" });
}
