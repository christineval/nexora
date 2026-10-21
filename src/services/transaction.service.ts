import "server-only";
import { recordAudit } from "@/server/audit";
import type { CurrentUser } from "@/lib/auth";
import { orderAccessWhere } from "@/server/order-access";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BusinessError } from "@/lib/errors";
import { nextStatus, type TransactionKind } from "@/lib/workflow";
import { idSchema, transactionSchema, type TransactionInput } from "@/validations/shared";
import { orderSchema, type OrderInput } from "@/validations/order.schema";
import type { TransactionRow } from "@/types/features";
import { purchaseCreateSchema } from "@/validations/purchase-create.schema";
import { createProductInTransaction } from "./inventory.service";
import { canWrite } from "@/lib/access";

export async function listTransactions(kind: TransactionKind, user: CurrentUser): Promise<TransactionRow[]> {
  const where = orderAccessWhere(user, kind);
  if (kind === "sales") {
    const rows = await prisma.orders.findMany({ where, include: { customers: { select: { name: true } }, users: { select: { name: true } }, order_items: { include: { products: { select: { name: true, sku: true } } } } }, orderBy: [{ order_date: "desc" }, { id: "desc" }] });
    return rows.map(row => ({ id: row.id.toString(), party: row.customers.name, partyId: row.customer_id.toString(), timestamp: row.order_date.toISOString(), status: row.status, total: row.total_amount.toFixed(2), createdBy: row.users.name, items: row.order_items.map(item => ({ id: item.id.toString(), productId: item.product_id.toString(), name: item.products.name, sku: item.products.sku, quantity: item.quantity, unitPrice: item.unit_price.toFixed(2), lineTotal: item.line_total.toFixed(2) })) }));
  }
  const rows = await prisma.purchase_orders.findMany({ where, include: { suppliers: { select: { name: true } }, users: { select: { name: true } }, purchase_items: { include: { products: { select: { name: true, sku: true } } } } }, orderBy: [{ purchase_date: "desc" }, { id: "desc" }] });
  return rows.map(row => ({ id: row.id.toString(), party: row.suppliers.name, partyId: row.supplier_id.toString(), timestamp: row.purchase_date.toISOString(), status: row.status, total: row.total_amount.toFixed(2), createdBy: row.users.name, items: row.purchase_items.map(item => ({ id: item.id.toString(), productId: item.product_id.toString(), name: item.products.name, sku: item.products.sku, quantity: item.quantity, unitPrice: item.unit_price.toFixed(2), lineTotal: item.line_total.toFixed(2) })) }));
}

async function prepareTransaction(tx: Prisma.TransactionClient, kind: TransactionKind, data: TransactionInput | OrderInput, user: CurrentUser) {
  const walkInCustomer = kind === "sales" && "walkInCustomer" in data ? data.walkInCustomer : undefined;
  const party = walkInCustomer
    ? await tx.customers.create({ data: { name: walkInCustomer.name, status: "ACTIVE" } })
    : data.partyId ? (kind === "sales" ? await tx.customers.findUnique({ where: { id: BigInt(data.partyId) } }) : await tx.suppliers.findUnique({ where: { id: BigInt(data.partyId) } })) : null;
  if (!party || party.status !== "ACTIVE") throw new BusinessError("Select an active customer or supplier.", 400);
  if (walkInCustomer) await recordAudit(tx, user, { action: "CUSTOMER_CREATED", entity: "CUSTOMER", entityId: party.id, after: party });
  const partyId = party.id;
  const products = await tx.products.findMany({ where: { id: { in: data.items.map(item => BigInt(item.productId)) }, status: "ACTIVE" } });
  const productsById = new Map(products.map(product => [product.id.toString(), product]));
  const items = data.items.map(item => {
    const product = productsById.get(item.productId);
    if (!product) throw new BusinessError("One of the selected products is unavailable.", 400);
    if (kind === "sales" && item.quantity > product.stock_qty) {
      throw new BusinessError(`Insufficient stock for ${product.name}. Available: ${product.stock_qty}. Requested: ${item.quantity}.`);
    }
    const price = kind === "sales" ? product.selling_price : product.unit_cost;
    return { product_id: product.id, quantity: item.quantity, unit_price: price, line_total: price.mul(item.quantity) };
  });
  const total = items.reduce((sum, item) => sum.add(item.line_total), new Prisma.Decimal(0));
  if (total.lte(0) || total.gt("9999999999.99")) throw new BusinessError("The order total must be positive and within the supported amount.", 400);
  return { partyId, items, total, date: new Date(data.date + "T00:00:00+08:00") };
}

export async function createTransaction(kind: TransactionKind, input: unknown, user: CurrentUser) {
  orderAccessWhere(user, kind, true);
  const userId = user.id;
  const data = kind === "sales" ? orderSchema.parse(input) : purchaseCreateSchema.parse(input);
  if (data.items.some(item => "newProduct" in item && item.newProduct) && !canWrite(user.role, "inventory")) {
    throw new BusinessError("Your role does not allow creating products.", 403);
  }
  return prisma.$transaction(async tx => {
    const resolvedItems: TransactionInput["items"] = [];
    for (const item of data.items) {
      if ("newProduct" in item && item.newProduct) {
        const product = await createProductInTransaction(tx, item.newProduct, user.id);
        resolvedItems.push({ productId: product.id.toString(), quantity: item.quantity });
      } else if (item.productId !== undefined) {
        resolvedItems.push({ productId: item.productId, quantity: item.quantity });
      }
    }
    const { partyId, items, total, date } = await prepareTransaction(tx, kind, { ...data, items: resolvedItems }, user);
    // Approved rule: tax-free sales; prices are snapshots of current product prices.
    const row = kind === "sales"
      ? await tx.orders.create({ data: { customer_id: partyId, created_by: userId, order_date: date, subtotal: total, tax: 0, total_amount: total, order_items: { create: items } } })
      : await tx.purchase_orders.create({ data: { supplier_id: partyId, created_by: userId, purchase_date: date, total_amount: total, purchase_items: { create: items } } });
    await recordAudit(tx, user, { action: kind === "sales" ? "ORDER_CREATED" : "PURCHASE_CREATED", entity: kind === "sales" ? "ORDER" : "PURCHASE_ORDER", entityId: row.id, after: { ...row, [kind === "sales" ? "order_items" : "purchase_items"]: items } });
    return { id: row.id.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function editTransaction(kind: TransactionKind, recordId: string, input: unknown, user: CurrentUser) {
  const scope = orderAccessWhere(user, kind, true);
  const id = BigInt(idSchema.parse(recordId));
  const data = kind === "sales" ? orderSchema.parse(input) : transactionSchema.parse(input);
  return prisma.$transaction(async tx => {
    const existing = kind === "sales"
      ? await tx.orders.findUnique({ where: { id, ...scope }, include: { order_items: true } })
      : await tx.purchase_orders.findUnique({ where: { id, ...scope }, include: { purchase_items: true } });
    if (!existing) throw new BusinessError("Transaction not found.", 404);
    const { partyId, items, total, date } = await prepareTransaction(tx, kind, data, user);
    const changed = kind === "sales"
      ? await tx.orders.updateMany({ where: { id, ...scope, status: "PENDING" }, data: { customer_id: partyId, order_date: date, subtotal: total, tax: 0, total_amount: total, updated_at: new Date() } })
      : await tx.purchase_orders.updateMany({ where: { id, ...scope, status: "PENDING" }, data: { supplier_id: partyId, purchase_date: date, total_amount: total, updated_at: new Date() } });
    if (changed.count !== 1) throw new BusinessError("Only pending orders can be edited. Refresh and try again.");
    if (kind === "sales") {
      await tx.order_items.deleteMany({ where: { order_id: id } });
      await tx.order_items.createMany({ data: items.map(item => ({ ...item, order_id: id })) });
    } else {
      await tx.purchase_items.deleteMany({ where: { purchase_order_id: id } });
      await tx.purchase_items.createMany({ data: items.map(item => ({ ...item, purchase_order_id: id })) });
    }
    await recordAudit(tx, user, { action: kind === "sales" ? "ORDER_UPDATED" : "PURCHASE_UPDATED", entity: kind === "sales" ? "ORDER" : "PURCHASE_ORDER", entityId: id, before: existing, after: { id, customer_id: kind === "sales" ? partyId : undefined, supplier_id: kind === "purchasing" ? partyId : undefined, [kind === "sales" ? "order_date" : "purchase_date"]: date, status: "PENDING", total_amount: total, [kind === "sales" ? "order_items" : "purchase_items"]: items } });
    return { id: id.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionTransaction(kind: TransactionKind, recordId: string, action: string, user: CurrentUser) {
  const scope = orderAccessWhere(user, kind, true);
  const userId = user.id;
  const id = BigInt(idSchema.parse(recordId));
  return prisma.$transaction(async tx => {
    const row = kind === "sales" ? await tx.orders.findUnique({ where: { id, ...scope }, include: { order_items: true } }) : await tx.purchase_orders.findUnique({ where: { id, ...scope }, include: { purchase_items: true } });
    if (!row) throw new BusinessError("Transaction not found.", 404);
    const status = nextStatus(kind, row.status, action);
    const changed = kind === "sales"
      ? await tx.orders.updateMany({ where: { id, ...scope, status: row.status }, data: { status, updated_at: new Date() } })
      : await tx.purchase_orders.updateMany({ where: { id, ...scope, status: row.status }, data: { status, updated_at: new Date() } });
    if (changed.count !== 1) throw new BusinessError("Another operation changed this transaction. Refresh and try again.");
    const auditTransition = () => recordAudit(tx, user, { action: (kind === "sales" ? "ORDER_" : "PURCHASE_") + status, entity: kind === "sales" ? "ORDER" : "PURCHASE_ORDER", entityId: id, before: { status: row.status }, after: { status, total_amount: row.total_amount } });
    if (action !== "complete") { await auditTransition(); return { id: id.toString(), status }; }
    const items = "order_items" in row ? row.order_items : row.purchase_items;
    if (!items.length || row.total_amount.lte(0)) throw new BusinessError("This transaction has no valid positive total.");
    const itemTotal = items.reduce((sum, item) => {
      if (item.quantity <= 0 || !item.line_total.equals(item.unit_price.mul(item.quantity))) throw new BusinessError("The order has inconsistent line totals.");
      return sum.add(item.line_total);
    }, new Prisma.Decimal(0));
    const expectedTotal = "tax" in row ? itemTotal.add(row.tax) : itemTotal;
    if (!expectedTotal.equals(row.total_amount) || ("subtotal" in row && !row.subtotal.equals(itemTotal))) throw new BusinessError("The order total does not match its product lines.");
    const reference = kind === "sales" ? "ORDER" : "PURCHASE_ORDER";
    // Sort locks consistently; a conditional decrement prevents concurrent overselling.
    for (const item of [...items].sort((a, b) => a.product_id < b.product_id ? -1 : a.product_id > b.product_id ? 1 : 0)) {
      const changedStock = await tx.products.updateMany({
        where: { id: item.product_id, status: "ACTIVE", ...(kind === "sales" ? { stock_qty: { gte: item.quantity } } : { stock_qty: { lte: 2147483647 - item.quantity } }) },
        data: { stock_qty: kind === "sales" ? { decrement: item.quantity } : { increment: item.quantity }, updated_at: new Date() },
      });
      if (changedStock.count !== 1) {
        const product = await tx.products.findUnique({ where: { id: item.product_id }, select: { name: true, stock_qty: true } });
        throw new BusinessError(kind === "sales" ? `Insufficient stock or inactive product: ${product?.name ?? "Product"}. Available: ${product?.stock_qty ?? 0}.` : "A product is inactive or its stock would exceed the supported quantity.");
      }
      // The existing PostgreSQL constraint stores positive magnitudes for every type.
      await tx.inventory_movements.create({ data: { product_id: item.product_id, type: kind === "sales" ? "SALE" : "PURCHASE", quantity: item.quantity, reference_type: reference, reference_id: id, created_by: userId } });
    }
    // Approved rules: cash sale revenue, or inventory received on supplier credit.
    const accounts = kind === "sales" ? ["Cash", "Sales Revenue"] : ["Inventory", "Accounts Payable"];
    await tx.ledger_entries.createMany({ data: accounts.map((account, index) => ({ account_name: account, entry_type: index === 0 ? "DEBIT" : "CREDIT", amount: row.total_amount, reference_type: reference, reference_id: id, description: kind === "sales" ? "Completed cash sale" : "Purchase inventory received on credit", created_by: userId })) });
    await recordAudit(tx, user, { action: "LEDGER_POSTED", entity: "LEDGER", entityId: id, after: { reference_type: reference, reference_id: id, amount: row.total_amount, name: accounts.join(" / ") } });
    await auditTransition();
    return { id: id.toString(), status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
