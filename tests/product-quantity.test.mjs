import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const input = { name: "Opening stock", supplierProductCode: "SUP-001", unitCost: "5.00", sellingPrice: "6.50" };
const { createProductRequestSchema } = loadTs("src/validations/product.schema.ts");

function harness(failure) {
  const products = [], movements = [], audits = [];
  let transactions = 0;
  const tx = {
    async $queryRaw() { return [{ sku: "ERP-0001" }]; },
    users: { async findUnique() { return { id: 2n, name: "Inventory", role: "INVENTORY" }; } },
    products: { async findMany({ where }) { return products.filter(product => product.id !== where.id?.not); }, async create({ data }) { const product = { ...data, id: 10n }; products.push(product); return product; } },
    inventory_movements: { async create({ data }) {
      if (failure === "movement") throw new Error("Movement failed");
      const movement = { ...data, id: 20n }; movements.push(movement); return movement;
    } },
    audit_logs: { async create({ data }) {
      if (failure === data.action) throw new Error("Audit failed");
      audits.push(data);
    } },
    ledger_entries: { async createMany() { assert.fail("Starting stock follows inventory adjustment rules, without finance posting"); } },
  };
  const prisma = { async $transaction(operation) {
    transactions++;
    try { return await operation(tx); }
    catch (error) { products.length = movements.length = audits.length = 0; throw error; }
  } };
  return { products, movements, audits, get transactions() { return transactions; }, ...loadTs("src/services/inventory.service.ts", { "@/lib/prisma": { prisma } }) };
}

test("starting quantity creates product stock and a matching adjustment with the authenticated actor in one transaction", async () => {
  const state = harness();
  const product = await state.createProduct({ ...input, quantity: 12, stock_qty: 999, created_by: "999", status: "INACTIVE" }, 2n);
  assert.equal(state.transactions, 1);
  assert.equal(product.stock_qty, 12);
  assert.equal(product.status, "ACTIVE");
  assert.equal(product.sku, "ERP-0001");
  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0].quantity, 12);
  assert.equal(state.movements[0].type, "ADJUSTMENT_IN");
  assert.equal(state.movements[0].reference_type, "ADJUSTMENT");
  assert.equal(state.movements[0].product_id, product.id);
  assert.equal(state.movements[0].created_by, 2n);
  assert.equal(state.audits[0].after.stock_qty, 12);
  assert.equal(state.audits[1].action, "STOCK_ADJUSTED");
  assert.equal(state.audits[1].before.stock_qty, 0);
  assert.equal(state.audits[1].after.stock_qty, 12);
});

test("zero or omitted starting quantity creates no zero-quantity audit movement", async () => {
  for (const data of [input, { ...input, quantity: 0 }]) {
    const state = harness();
    const row = await state.createProduct(data, 2n);
    assert.equal(row.stock_qty, 0);
    assert.equal(state.movements.length, 0);
    assert.equal(state.audits.length, 1);
  }
});

test("invalid starting quantities fail validation before opening a transaction", async () => {
  for (const quantity of [-1, 1.5, 2147483648, "12", null, NaN, Infinity]) {
    const state = harness();
    await assert.rejects(state.createProduct({ ...input, quantity }, 2n));
    assert.equal(state.transactions, 0);
  }
  assert.equal(createProductRequestSchema.parse({ ...input, quantity: 2147483647 }).quantity, 2147483647);
});

test("failure writing the stock movement or either audit entry rolls back product creation and all dependent writes", async () => {
  for (const failure of ["movement", "PRODUCT_CREATED", "STOCK_ADJUSTED"]) {
    const state = harness(failure);
    await assert.rejects(state.createProduct({ ...input, quantity: 12 }, 2n));
    assert.equal(state.products.length, 0);
    assert.equal(state.movements.length, 0);
    assert.equal(state.audits.length, 0);
  }
});
