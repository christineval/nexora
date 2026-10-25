import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { loadTs } from "./load-ts.mjs";

const actor = { id: 2n, name: "Test actor", role: "ADMIN" };

function pendingHarness(stock = 10, failOrder = false) {
  const writes = [];
  const customers = [];
  const audit = [];
  const model = {
    async findUnique() { return { id: 1n }; },
    async create({ data }) { if (failOrder) throw new Error("Order write failed"); writes.push(data); return { id: 1n }; },
    async updateMany({ data }) { writes.push(data); return { count: 1 }; },
  };
  const tx = {
    audit_logs: { async create({ data }) { audit.push(data); } },
    customers: {
      async findMany() { return customers; },
      async findUnique() { return { id: 1n, status: "ACTIVE" }; },
      async create({ data }) { const row = { id: 3n, ...data }; customers.push(row); return row; },
    },
    suppliers: { async findUnique() { return { id: 1n, status: "ACTIVE" }; } },
    products: { async findMany() { return [
      { id: 1n, name: "Test product", stock_qty: stock, selling_price: new Prisma.Decimal("0.10"), unit_cost: new Prisma.Decimal("0.05") },
      { id: 2n, name: "Second product", stock_qty: 1, selling_price: new Prisma.Decimal("0.20"), unit_cost: new Prisma.Decimal("0.15") },
    ]; } },
    orders: model,
    purchase_orders: model,
    order_items: {
      async deleteMany() { writes.push("delete items"); },
      async createMany({ data }) { writes.push(data); },
    },
  };
  const prisma = { async $transaction(operation, options) {
    assert.equal(options.isolationLevel, "Serializable");
    const beforeAudit = audit.length;
    const beforeWrites = writes.length;
    const beforeCustomers = customers.length;
    try { return await operation(tx); }
    catch (error) { audit.length = beforeAudit; writes.length = beforeWrites; customers.length = beforeCustomers; throw error; }
  } };
  const input = { partyId: "1", date: "2026-10-10", items: [{ productId: "1", quantity: 3 }] };
  return { writes, customers, audit, input, service: loadTs("src/services/transaction.service.ts", { "@/lib/prisma": { prisma } }) };
}

test("walk-in sales create a named customer and link the order within one transaction", async () => {
  const { writes, customers, input, service } = pendingHarness();
  const order = { date: input.date, items: input.items };
  await service.createTransaction("sales", { ...order, walkInCustomer: { name: "  Walk-in buyer  " } }, actor);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].name, "Walk-in buyer");
  assert.equal(customers[0].status, "ACTIVE");
  assert.equal(writes[0].customer_id, customers[0].id);
  assert.equal(writes[0].total_amount.toFixed(2), "0.30");
});

test("walk-in customer creation rolls back on insufficient stock or order write failure", async () => {
  for (const [stock, failOrder] of [[0, false], [10, true]]) {
    const { writes, customers, input, service } = pendingHarness(stock, failOrder);
    const order = { date: input.date, items: input.items };
    await assert.rejects(service.createTransaction("sales", { ...order, walkInCustomer: { name: "Walk-in buyer" } }, actor));
    assert.equal(customers.length, 0);
    assert.equal(writes.length, 0);
  }
});

test("editing a pending sale can link a newly created walk-in customer", async () => {
  const { writes, customers, input, service } = pendingHarness();
  const order = { date: input.date, items: input.items };
  await service.editTransaction("sales", "1", { ...order, walkInCustomer: { name: "Walk-in buyer" } }, actor);
  assert.equal(writes[0].customer_id, customers[0].id);
});

test("purchases reject walk-in input and do not create customers", async () => {
  const { customers, input, service } = pendingHarness();
  const order = { date: input.date, items: input.items };
  await assert.rejects(service.createTransaction("purchasing", { ...order, walkInCustomer: { name: "Walk-in buyer" } }, actor));
  assert.equal(customers.length, 0);
});

test("pending sales reject quantities above stock, including zero stock, before any writes", async () => {
  for (const stock of [2, 0]) {
    const { writes, input, service } = pendingHarness(stock);
    await assert.rejects(service.createTransaction("sales", input, actor), error => {
      assert.equal(error.status, 409);
      assert.equal(error.message, `Insufficient stock for Test product. Available: ${stock}. Requested: 3.`);
      return true;
    });
    assert.equal(writes.length, 0);
  }
});

test("a shortage on a later sales line prevents the entire pending order", async () => {
  const { writes, input, service } = pendingHarness();
  input.items.push({ productId: "2", quantity: 2 });
  await assert.rejects(service.createTransaction("sales", input, actor), /Insufficient stock for Second product/);
  assert.equal(writes.length, 0);
});

test("pending sales allow quantities below or equal to stock using authoritative prices", async () => {
  for (const stock of [10, 3]) {
    const { writes, input, service } = pendingHarness(stock);
    await service.createTransaction("sales", input, actor);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].total_amount.toFixed(2), "0.30");
    assert.equal(writes[0].order_items.create[0].quantity, 3);
  }
});

test("pending sales edits reject shortages before changing headers or replacing items", async () => {
  const { writes, input, service } = pendingHarness(2);
  await assert.rejects(service.editTransaction("sales", "1", input, actor), /Insufficient stock for Test product/);
  assert.equal(writes.length, 0);
});

test("pending purchases can exceed current stock", async () => {
  const { writes, input, service } = pendingHarness(0);
  await service.createTransaction("purchasing", input, actor);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].total_amount.toFixed(2), "0.15");
});

test("invoice prices remain reference-only and purchases use stored product costs", async () => {
  const { writes, input, service } = pendingHarness();
  input.items[0].unitPrice = "999.99";
  await service.createTransaction("purchasing", input, actor);
  assert.equal(writes[0].purchase_items.create[0].unit_price.toFixed(2), "0.05");
  assert.equal(writes[0].total_amount.toFixed(2), "0.15");
});

function harness({ kind = "sales", stock = 10, failLedger = false, failMovement = false, failGuard = false, failAudit = false } = {}) {
  const state = { status: kind === "sales" ? "CONFIRMED" : "ORDERED", stock, movements: [], ledger: [], audit: [] };
  const item = { product_id: 1n, quantity: 3, unit_price: new Prisma.Decimal("0.10"), line_total: new Prisma.Decimal("0.30") };
  const model = {
    async findUnique() { return { id: 1n, status: state.status, total_amount: new Prisma.Decimal("0.30"), ...(kind === "sales" ? { subtotal: new Prisma.Decimal("0.30"), tax: new Prisma.Decimal(0), order_items: [item] } : { purchase_items: [item] }) }; },
    async updateMany({ where, data }) { if (failGuard || state.status !== where.status) return { count: 0 }; state.status = data.status; return { count: 1 }; },
  };
  const tx = { orders: model, purchase_orders: model,
    audit_logs: { async create({ data }) { if (failAudit) throw new Error("Audit write failed"); state.audit.push(data); } },
    products: {
      async updateMany({ where, data }) { if (where.stock_qty.gte !== undefined && state.stock < where.stock_qty.gte) return { count: 0 }; state.stock += data.stock_qty.increment ?? -data.stock_qty.decrement; return { count: 1 }; },
      async findUnique() { return { name: "Test product", stock_qty: state.stock }; },
    },
    inventory_movements: { async create({ data }) { if (failMovement) throw new Error("Movement write failed"); state.movements.push(data); } },
    ledger_entries: { async createMany({ data }) { if (failLedger) throw new Error("Ledger write failed"); state.ledger.push(...data); } },
  };
  const prisma = { async $transaction(operation, options) {
    assert.equal(options.isolationLevel, "Serializable");
    const snapshot = structuredClone(state);
    try { return await operation(tx); }
    catch (error) { Object.assign(state, snapshot); throw error; }
  } };
  return { state, service: loadTs("src/services/transaction.service.ts", { "@/lib/prisma": { prisma } }) };
}
test("completing a sale updates header, positive audit magnitude and balanced cash revenue", async () => {
  const { state, service } = harness();
  await service.transitionTransaction("sales", "1", "complete", actor);
  assert.equal(state.status, "COMPLETED"); assert.equal(state.stock, 7);
  assert.equal(state.movements[0].quantity, 3); assert.equal(state.movements[0].type, "SALE");
  assert.deepEqual(state.ledger.map(row => row.account_name), ["Cash", "Sales Revenue"]);
  assert.equal(state.ledger[0].amount.toFixed(2), "0.30");
  assert.equal(state.ledger[0].amount.equals(state.ledger[1].amount), true);
  await assert.rejects(service.transitionTransaction("sales", "1", "complete", actor));
  assert.equal(state.stock, 7); assert.equal(state.ledger.length, 2);
  assert.deepEqual(state.audit.map(row => row.action), ["LEDGER_POSTED", "ORDER_COMPLETED"]);
  assert.equal(state.audit[1].actor_id, actor.id);
});
test("receiving a purchase increases inventory and posts balanced supplier credit", async () => {
  const { state, service } = harness({ kind: "purchasing" });
  await service.transitionTransaction("purchasing", "1", "complete", actor);
  assert.equal(state.stock, 13); assert.equal(state.status, "RECEIVED");
  assert.deepEqual(state.ledger.map(row => row.account_name), ["Inventory", "Accounts Payable"]);
  await assert.rejects(service.transitionTransaction("purchasing", "1", "complete", actor));
  assert.equal(state.stock, 13);
});
test("insufficient stock and failures in audit or finance roll back every dependent write", async () => {
  for (const config of [{ stock: 2 }, { failMovement: true }, { failLedger: true }, { failGuard: true }, { failAudit: true }]) {
    const { state, service } = harness(config); const before = structuredClone(state);
    await assert.rejects(service.transitionTransaction("sales", "1", "complete", actor));
    assert.deepEqual(state, before);
  }
});
test("cancellation does not apply inventory or financial effects", async () => {
  const { state, service } = harness();
  await service.transitionTransaction("sales", "1", "cancel", actor);
  assert.equal(state.status, "CANCELLED"); assert.equal(state.stock, 10);
  assert.equal(state.movements.length, 0); assert.equal(state.ledger.length, 0);
});


test("walk-in sales reject existing customer names without creating a second customer or order", async () => {
  const state = pendingHarness();
  const input = { date: state.input.date, items: state.input.items, walkInCustomer: { name: "Walk-in buyer" } };
  await state.service.createTransaction("sales", input, actor);
  const beforeWrites = state.writes.length;
  await assert.rejects(state.service.createTransaction("sales", { ...input, walkInCustomer: { name: "  WALK-IN   BUYER " } }, actor), /name already exists/);
  assert.equal(state.customers.length, 1);
  assert.equal(state.writes.length, beforeWrites);
});
