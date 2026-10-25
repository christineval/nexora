import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { loadTs } from "./load-ts.mjs";

const actor = { id: 2n, name: "Inventory user", role: "INVENTORY" };
const newProduct = { name: "New ink", supplierProductCode: "SUP-INK/001", unitCost: "0.10", sellingPrice: "0.25" };
const input = { importKey: "281deca6-cb7d-4ed5-ae13-f43cc7765672", partyId: "1", date: "2026-10-24", items: [{ productId: "1", quantity: 3 }, { newProduct, quantity: 2 }] };

function harness(options = {}) {
  const products = [{ id: 1n, sku: "ERP-0000", name: "Existing", status: "ACTIVE", stock_qty: options.overflow ? 2147483647 : 8, unit_cost: new Prisma.Decimal("0.05"), selling_price: new Prisma.Decimal("0.20") }];
  const purchases = [], movements = [], ledger = [], audit = [];
  const calls = { transactions: 0, skuBatches: 0, productBatches: 0, auditBatches: 0, movementBatches: 0 };
  let sequence = 0;
  const tx = {
    async $queryRaw(strings, ...values) {
      const query = strings.join("");
      if (/pg_advisory_xact_lock/.test(query)) return [{ locked: 1 }];
      assert.match(query, /generate_series/); assert.match(query, /nextval\('public.product_sku_seq'/);
      calls.skuBatches++;
      return Array.from({ length: values[0] }, () => ({ sku: `ERP-${String(++sequence).padStart(4, "0")}` }));
    },
    products: {
      async createManyAndReturn({ data }) {
        calls.productBatches++;
        const created = data.map((product, index) => ({ ...product, id: BigInt(10 + products.length + index), unit_cost: new Prisma.Decimal(product.unit_cost), selling_price: new Prisma.Decimal(product.selling_price) }));
        products.push(...created);
        return [...created].reverse();
      },
      async findMany({ where }) { if (where.OR) return products.filter(product => product.id !== where.id?.not); return products.filter(product => where.id.in.includes(product.id) && product.status === where.status && !(options.unavailable && product.id === 1n)); },
      async updateMany({ where, data }) {
        const product = products.find(product => product.id === where.id);
        if (!product || product.status !== where.status || product.stock_qty > where.stock_qty.lte) return { count: 0 };
        if (options.failLaterStock && product.id !== 1n) throw new Error("Stock update failed");
        product.stock_qty += data.stock_qty.increment;
        return { count: 1 };
      },
      async findUnique({ where }) { return products.find(product => product.id === where.id) ?? null; },
    },
    suppliers: { async findUnique() { return options.invalidSupplier ? null : { id: 1n, status: "ACTIVE" }; } },
    purchase_orders: {
      async create({ data }) {
        if (options.failPurchase) throw new Error("Purchase failed");
        const row = { ...data, id: BigInt(20 + purchases.length) }; purchases.push(row); return row;
      },
      async findUnique({ where }) {
        const row = purchases.find(purchase => Object.entries(where).every(([field, value]) => purchase[field] === value));
        return row ? { ...row, purchase_items: row.purchase_items.create } : null;
      },
    },
    inventory_movements: { async createMany({ data }) { if (options.failMovement) throw new Error("Movement failed"); calls.movementBatches++; movements.push(...data); } },
    ledger_entries: { async createMany({ data }) { if (options.failLedger) throw new Error("Ledger failed"); ledger.push(...data); } },
    audit_logs: {
      async findFirst({ where }) { const row = audit.find(event => event.actor_id === where.actor_id && event.action === where.action && event.after?.import_key === where.after.equals); return row ? { entity_id: row.entity_id, after: row.after } : null; },
      async createMany({ data }) { if (options.failAudit === "PRODUCT_CREATED") throw new Error("Product audit failed"); calls.auditBatches++; audit.push(...data); },
      async create({ data }) { if (options.failAudit === data.action) throw new Error("Audit failed"); audit.push(data); },
    },
  };
  const prisma = { async $transaction(operation, settings) {
    calls.transactions++;
    assert.equal(settings.isolationLevel, "Serializable"); assert.equal(settings.timeout, 30000);
    const before = { products: products.map(product => ({ ...product })), purchases: purchases.length, movements: movements.length, ledger: ledger.length, audit: audit.length };
    try { return await operation(tx); }
    catch (error) { products.splice(0, products.length, ...before.products); purchases.length = before.purchases; movements.length = before.movements; ledger.length = before.ledger; audit.length = before.audit; throw error; }
  } };
  return { products, purchases, movements, ledger, audit, calls, service: loadTs("src/services/purchase-invoice.service.ts", { "@/lib/prisma": { prisma } }), transactions: loadTs("src/services/transaction.service.ts", { "@/lib/prisma": { prisma } }) };
}

test("invoice import creates a received purchase, adds existing/new stock, and posts balanced receipt entries atomically", async () => {
  const state = harness();
  const result = await state.service.importPurchaseInvoice({ ...input, created_by: "999", role: "ADMIN", status: "PENDING" }, actor);
  assert.equal(result.status, "RECEIVED");
  assert.equal(state.purchases[0].status, "RECEIVED");
  assert.equal(state.purchases[0].created_by, actor.id);
  assert.equal(state.purchases[0].total_amount.toFixed(2), "0.35");
  assert.equal(state.products[0].stock_qty, 11);
  assert.equal(state.products[1].stock_qty, 2);
  assert.equal(state.products[1].supplier_product_code, "SUP-INK/001");
  assert.equal(state.movements.length, 2);
  assert.ok(state.movements.every(row => row.type === "PURCHASE" && row.reference_id === 20n && row.created_by === actor.id));
  assert.deepEqual(state.ledger.map(row => row.account_name), ["Inventory", "Accounts Payable"]);
  assert.deepEqual(state.ledger.map(row => row.entry_type), ["DEBIT", "CREDIT"]);
  assert.equal(state.ledger[0].amount.toFixed(2), "0.35");
  assert.equal(state.ledger[0].amount.equals(state.ledger[1].amount), true);
  assert.deepEqual(state.audit.map(row => row.action), ["PRODUCT_CREATED", "PURCHASE_CREATED", "LEDGER_POSTED", "PURCHASE_RECEIVED"]);
  assert.equal(state.audit.at(-1).after.import_key, input.importKey);
  assert.equal(state.calls.productBatches, 1);
  await assert.rejects(state.transactions.transitionTransaction("purchasing", result.id, "complete", actor));
  assert.equal(state.products[0].stock_qty, 11);
});

test("retrying the same import returns its existing purchase without applying stock/finance or creating products again", async () => {
  const state = harness();
  const first = await state.service.importPurchaseInvoice(input, actor);
  const again = await state.service.importPurchaseInvoice(input, actor);
  assert.equal(again.id, first.id);
  assert.equal(state.purchases.length, 1); assert.equal(state.products.length, 2);
  assert.equal(state.products[0].stock_qty, 11); assert.equal(state.products[1].stock_qty, 2);
  assert.equal(state.movements.length, 2); assert.equal(state.ledger.length, 2);
  assert.equal(state.calls.productBatches, 1);
  await assert.rejects(state.service.importPurchaseInvoice({ ...input, items: [{ productId: "1", quantity: 100 }] }, actor), /already saved/);
  assert.equal(state.products[0].stock_qty, 11);
});

test("any purchase, stock, inventory, finance, supplier, product or audit failure rolls back the entire invoice", async () => {
  for (const options of [{ failPurchase: true }, { failLaterStock: true }, { failMovement: true }, { failLedger: true }, { invalidSupplier: true }, { unavailable: true }, { overflow: true }, ...["PRODUCT_CREATED", "PURCHASE_CREATED", "LEDGER_POSTED", "PURCHASE_RECEIVED"].map(failAudit => ({ failAudit }))]) {
    const state = harness(options);
    const stock = state.products[0].stock_qty;
    await assert.rejects(state.service.importPurchaseInvoice(input, actor));
    assert.equal(state.products.length, 1); assert.equal(state.products[0].stock_qty, stock);
    assert.equal(state.purchases.length, 0); assert.equal(state.movements.length, 0); assert.equal(state.ledger.length, 0); assert.equal(state.audit.length, 0);
  }
});

test("ten new products are created in batches and linked correctly even if PostgreSQL returns rows out of order", async () => {
  const state = harness();
  const items = Array.from({ length: 10 }, (_, index) => ({ newProduct: { ...newProduct, name: `Item ${index}`, supplierProductCode: `SUP-ITEM-${index}`, unitCost: `${index + 1}.00`, sellingPrice: `${index + 2}.00` }, quantity: index + 1 }));
  await state.service.importPurchaseInvoice({ ...input, items }, actor);
  assert.equal(state.calls.skuBatches, 1); assert.equal(state.calls.productBatches, 1); assert.equal(state.calls.auditBatches, 1); assert.equal(state.calls.movementBatches, 1);
  state.purchases[0].purchase_items.create.forEach((line, index) => {
    const product = state.products.find(product => product.id === line.product_id);
    assert.equal(product.name, `Item ${index}`); assert.equal(product.stock_qty, index + 1);
  });
});

test("unauthorized roles and malformed invoice references fail before starting any transaction", async () => {
  for (const role of ["SALES", "FINANCE", "GUEST", "REVOKED"]) {
    const state = harness(); await assert.rejects(state.service.importPurchaseInvoice(input, { ...actor, role }), error => error.status === 403); assert.equal(state.calls.transactions, 0);
  }
  for (const patch of [{ partyId: "" }, { partyId: "not-an-id" }, { importKey: "" }, { items: [{ productId: "not-an-id", quantity: 1 }] }]) {
    const state = harness(); await assert.rejects(state.service.importPurchaseInvoice({ ...input, ...patch }, actor)); assert.equal(state.calls.transactions, 0);
  }
});


test("invoice import rejects a new product using an existing barcode without applying any business effects", async () => {
  const state = harness();
  state.products[0].supplier_product_code = " sup \u2013 INK / 001 ";
  state.products[0].status = "INACTIVE";
  await assert.rejects(state.service.importPurchaseInvoice(input, actor), /barcode already exists/);
  assert.equal(state.calls.skuBatches, 0);
  assert.equal(state.calls.productBatches, 0);
  assert.equal(state.products.length, 1);
  for (const records of [state.purchases, state.movements, state.ledger, state.audit]) assert.equal(records.length, 0);
});
