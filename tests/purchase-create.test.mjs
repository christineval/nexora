import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { loadTs } from "./load-ts.mjs";

const actor = { id: 2n, name: "Inventory user", role: "INVENTORY" };
const newProduct = { name: "New ink", supplierProductCode: "SUP-INK/001", size: "65ml", unitCost: "0.10", sellingPrice: "0.25" };
const input = { partyId: "1", date: "2026-10-21", items: [{ productId: "1", quantity: 3 }, { newProduct, quantity: 2 }] };
const { purchaseCreateSchema } = loadTs("src/validations/purchase-create.schema.ts");

function harness({ failPurchase = false, failProduct = false, invalidSupplier = false, unavailableProduct = false } = {}) {
  const products = [{ id: 1n, name: "Existing", status: "ACTIVE", stock_qty: 8, unit_cost: new Prisma.Decimal("0.05"), selling_price: new Prisma.Decimal("0.20") }];
  const purchases = [];
  let transactions = 0;
  let sequence = 0;
  const tx = {
    users: { async findUnique() { return actor; } },
    audit_logs: { async create() {} },
    async $queryRaw(strings) {
      assert.match(strings.join(""), /nextval\('public.product_sku_seq'/);
      return [{ sku: `ERP-${String(++sequence).padStart(4, "0")}` }];
    },
    suppliers: { async findUnique({ where }) { return where.id === 1n && !invalidSupplier ? { id: 1n, status: "ACTIVE" } : null; } },
    products: {
      async create({ data }) {
        if (failProduct && products.length > 1) throw new Error("Product write failed");
        const row = { ...data, id: BigInt(products.length + 10), unit_cost: new Prisma.Decimal(data.unit_cost), selling_price: new Prisma.Decimal(data.selling_price) };
        products.push(row);
        return row;
      },
      async findMany({ where }) { if (where.OR) return products.filter(product => product.id !== where.id?.not);
        return products.filter(row => where.id.in.includes(row.id) && row.status === where.status && !(unavailableProduct && row.id === 1n));
      },
      async updateMany() { assert.fail("Import must not change stock"); },
    },
    purchase_orders: { async create({ data }) {
      if (failPurchase) throw new Error("Purchase write failed");
      purchases.push(data);
      return { id: 20n };
    } },
    inventory_movements: { async create() { assert.fail("Import must not create stock movements"); } },
    ledger_entries: { async createMany() { assert.fail("Import must not post to finance"); } },
  };
  const prisma = { async $transaction(operation, options) {
    transactions++;
    assert.equal(options.isolationLevel, "Serializable");
    const before = products.length;
    try { return await operation(tx); }
    catch (error) { products.length = before; purchases.length = 0; throw error; }
  } };
  return { products, purchases, get transactions() { return transactions; }, service: loadTs("src/services/transaction.service.ts", { "@/lib/prisma": { prisma } }) };
}

test("mixed purchases create zero-stock products with generated SKUs and link all lines in one transaction", async () => {
  const state = harness();
  const result = await state.service.createTransaction("purchasing", { ...input, created_by: "999", role: "ADMIN" }, actor);
  assert.equal(result.id, "20");
  assert.equal(state.transactions, 1);
  assert.equal(state.products.length, 2);
  const added = state.products[1];
  assert.equal(added.name, "New ink");
  assert.equal(added.supplier_product_code, "SUP-INK/001");
  assert.equal(added.sku, "ERP-0001");
  assert.equal(added.stock_qty, 0);
  assert.equal(added.status, "ACTIVE");
  assert.equal(state.products[0].stock_qty, 8);
  assert.equal(state.purchases[0].created_by, actor.id);
  assert.equal(state.purchases[0].total_amount.toFixed(2), "0.35");
  assert.equal(state.purchases[0].purchase_items.create[0].product_id, 1n);
  assert.equal(state.purchases[0].purchase_items.create[1].product_id, added.id);
  assert.equal(state.purchases[0].purchase_items.create[1].unit_price.toFixed(2), "0.10");
});

test("failed purchase, supplier, product reference or later product write rolls back all new products", async () => {
  for (const options of [{ failPurchase: true }, { invalidSupplier: true }, { unavailableProduct: true }, { failProduct: true }]) {
    const state = harness(options);
    const data = options.failProduct ? { ...input, items: [...input.items, { newProduct: { ...newProduct, name: "Another new product", supplierProductCode: "ANOTHER-001" }, quantity: 1 }] } : input;
    await assert.rejects(state.service.createTransaction("purchasing", data, actor));
    assert.equal(state.transactions, 1);
    assert.equal(state.products.length, 1);
    assert.equal(state.purchases.length, 0);
    assert.equal(state.products[0].stock_qty, 8);
  }
});

test("new product costs use decimal-safe totals and invalid totals roll back product creation", async () => {
  const state = harness();
  await assert.rejects(state.service.createTransaction("purchasing", { ...input, items: [{ newProduct: { ...newProduct, unitCost: "0" }, quantity: 2 }] }, actor), /total must be positive/);
  assert.equal(state.products.length, 1);
  assert.equal(state.purchases.length, 0);
});

test("purchase product creation rejects guests, unauthorized roles and role changes before writes", async () => {
  for (const role of ["GUEST", "SALES", "FINANCE", "REVOKED"]) {
    const state = harness();
    await assert.rejects(state.service.createTransaction("purchasing", { ...input, role: "ADMIN" }, { ...actor, role }), error => error.status === 403);
    assert.equal(state.transactions, 0);
    assert.equal(state.products.length, 1);
  }
});

test("mixed purchase validation rejects ambiguous lines, duplicates, missing prices and invalid money or quantities", () => {
  const invalidItems = [
    [{ productId: "1", newProduct, quantity: 1 }],
    [{ quantity: 1 }],
    [{ productId: "1", quantity: 0 }],
    [{ newProduct: { ...newProduct, sellingPrice: "" }, quantity: 1 }],
    [{ newProduct: { ...newProduct, unitCost: "0.001" }, quantity: 1 }],
    [{ newProduct: { ...newProduct, name: " " }, quantity: 1 }],
    [{ newProduct: { ...newProduct, supplierProductCode: "X".repeat(151) }, quantity: 1 }],
    [{ productId: "1", quantity: 1 }, { productId: "1", quantity: 2 }],
    [{ newProduct, quantity: 1 }, { newProduct: { ...newProduct, name: " NEW INK " }, quantity: 1 }],
  ];
  for (const items of invalidItems) assert.equal(purchaseCreateSchema.safeParse({ ...input, items }).success, false);
  assert.equal(purchaseCreateSchema.safeParse(input).success, true);
});

test("browser-supplied stock, status and SKU cannot override new product creation rules", async () => {
  const state = harness();
  await state.service.createTransaction("purchasing", { ...input, items: [{ newProduct: { ...newProduct, sku: "TAMPERED", stock_qty: 100, stockQty: 100, quantity: 100, status: "INACTIVE" }, quantity: 2 }] }, actor);
  assert.equal(state.products[1].sku, "ERP-0001");
  assert.equal(state.products[1].stock_qty, 0);
  assert.equal(state.products[1].status, "ACTIVE");
});
