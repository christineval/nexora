import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

const decimal = value => new Prisma.Decimal(value);
const { inventoryCostChange } = loadTs("src/server/inventory-cost.ts");
const { purchasePaymentSchema } = loadTs("src/validations/purchase-payment.schema.ts");
const { postLedgerEntries } = loadTs("src/server/ledger-posting.ts");
const owner = { id: 2n, name: "Inventory owner", role: "INVENTORY" };
const admin = { id: 1n, name: "Administrator", role: "ADMIN" };
const input = { paymentKey: "281deca6-cb7d-4ed5-ae13-f43cc7765672", amount: "400.00", date: "2026-10-26", reference: "CASH-001" };

test("moving average combines old value with actual receipt cost and retains cost on later sales", () => {
  const receipt = inventoryCostChange({ stock_qty: 10, unit_cost: decimal(100), inventory_value: decimal(1000) }, 10, "in", decimal(120));
  assert.equal(receipt.stock, 20);
  assert.equal(receipt.value.toFixed(2), "2200.00");
  assert.equal(receipt.averageCost.toFixed(2), "110.00");
  const sale = inventoryCostChange({ stock_qty: receipt.stock, unit_cost: receipt.averageCost, inventory_value: receipt.value }, 5, "out");
  assert.equal(sale.amount.toFixed(2), "550.00");
  assert.equal(sale.value.toFixed(2), "1650.00");
});

test("cost allocation retains cents and clears every residual cent when the final stock is sold", () => {
  let product = { stock_qty: 3, unit_cost: decimal("0.33"), inventory_value: decimal("1.00") };
  const costs = [];
  for (let i = 0; i < 3; i++) {
    const next = inventoryCostChange(product, 1, "out");
    costs.push(next.amount.toFixed(2));
    product = { stock_qty: next.stock, unit_cost: next.averageCost, inventory_value: next.value };
  }
  assert.deepEqual(costs, ["0.33", "0.34", "0.33"]);
  assert.equal(product.inventory_value.toFixed(2), "0.00");
  const next = inventoryCostChange(product, 2, "in", decimal("1.23"));
  assert.equal(next.averageCost.toFixed(2), "1.23");
  assert.throws(() => inventoryCostChange(product, 1, "out"), /Insufficient/);
  assert.throws(() => inventoryCostChange(product, 0, "in"), /positive/);
});

test("large stock valuations preserve cents beyond the Decimal default precision", () => {
  const value = "21474836469978525163.53";
  const stock = { stock_qty: 2147483647, unit_cost: decimal("9999999999.99"), inventory_value: decimal(value) };
  const sale = inventoryCostChange(stock, 1, "out");
  assert.equal(sale.amount.toFixed(2), "9999999999.99");
  assert.equal(sale.value.toFixed(2), "21474836459978525163.54");
});

test("ledger writer rejects unbalanced, negative, overprecision and oversized entries before writes", async () => {
  let writes = 0;
  const tx = { ledger_entries: { async createMany() { writes++; } } };
  const entry = (entry_type, amount) => ({ entry_type, amount, account_name: "Test", created_by: 1n });
  for (const rows of [[], [entry("DEBIT", "10"), entry("CREDIT", "9")], [entry("DEBIT", "-1"), entry("CREDIT", "-1")], [entry("DEBIT", "1.001"), entry("CREDIT", "1.001")], [entry("DEBIT", "10000000000"), entry("CREDIT", "10000000000")]]) await assert.rejects(postLedgerEntries(tx, rows));
  assert.equal(writes, 0);
  await postLedgerEntries(tx, [entry("DEBIT", "10.10"), entry("CREDIT", "10.10")]);
  assert.equal(writes, 1);
});

function paymentHarness({ failLedger = false, failAudit = false, failGuard = false, status = "RECEIVED" } = {}) {
  const state = { payments: [], ledger: [], audit: [], guards: [] };
  const order = { id: 7n, created_by: owner.id, status, total_amount: decimal(1000), purchase_date: new Date("2026-10-01T00:00:00+08:00") };
  const matches = where => where.id === order.id && (where.created_by === undefined || where.created_by === order.created_by);
  const tx = {
    purchase_orders: {
      async findUnique({ where }) { return matches(where) ? { ...order, purchase_payments: state.payments.filter(p => p.purchase_order_id === order.id) } : null; },
      async updateMany({ where }) { state.guards.push(where); return { count: !failGuard && matches(where) && where.status === order.status ? 1 : 0 }; },
    },
    purchase_payments: {
      async findUnique({ where }) { const key = where.created_by_payment_key; return state.payments.find(p => p.created_by === key.created_by && p.payment_key === key.payment_key) ?? null; },
      async create({ data }) { const row = { id: BigInt(state.payments.length + 1), ...data }; state.payments.push(row); return row; },
    },
    ledger_entries: { async createMany({ data }) { if (failLedger) throw new Error("Finance write failed"); state.ledger.push(...data); } },
    audit_logs: { async create({ data }) { if (failAudit) throw new Error("Audit write failed"); state.audit.push(data); } },
  };
  const prisma = { async $transaction(operation, options) {
    assert.equal(options.isolationLevel, "Serializable");
    const before = Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, [...rows]]));
    try { return await operation(tx); } catch (error) { Object.assign(state, before); throw error; }
  } };
  return { state, order, service: loadTs("src/services/purchase-payment.service.ts", { "@/lib/prisma": { prisma } }) };
}

test("partial and final supplier payments settle the payable with matching cash entries and no stock writes", async () => {
  const { state, service } = paymentHarness();
  await service.recordPurchasePayment("7", { ...input, created_by: "999", role: "ADMIN" }, owner);
  assert.equal(state.payments[0].created_by, owner.id);
  assert.equal(state.payments[0].amount.toFixed(2), "400.00");
  assert.deepEqual(state.ledger.map(row => row.account_name), ["Accounts Payable", "Cash"]);
  assert.deepEqual(state.ledger.map(row => row.entry_type), ["DEBIT", "CREDIT"]);
  assert.equal(state.ledger[0].transaction_date.toISOString(), "2026-10-25T16:00:00.000Z");
  assert.equal(state.ledger[0].reference_id, state.payments[0].id);
  assert.equal(state.guards[0].created_by, owner.id);
  await service.recordPurchasePayment("7", { ...input, paymentKey: "381deca6-cb7d-4ed5-ae13-f43cc7765672", amount: "600.00" }, owner);
  assert.equal(state.payments.reduce((sum, row) => sum.add(row.amount), decimal(0)).toFixed(2), "1000.00");
  await assert.rejects(service.recordPurchasePayment("7", { ...input, paymentKey: "481deca6-cb7d-4ed5-ae13-f43cc7765672", amount: "0.01" }, owner), /exceeds/);
  assert.equal(state.ledger.length, 4);
});

test("payment retries return the original record and changed reuse fails without posting again", async () => {
  const { state, service } = paymentHarness();
  const first = await service.recordPurchasePayment("7", input, owner);
  assert.equal((await service.recordPurchasePayment("7", { ...input, amount: "400" }, owner)).id, first.id);
  for (const patch of [{ amount: "401" }, { date: "2026-10-25" }, { reference: "OTHER" }]) await assert.rejects(service.recordPurchasePayment("7", { ...input, ...patch }, owner), /already used/);
  assert.equal(state.payments.length, 1);
  assert.equal(state.ledger.length, 2);
});

test("payments enforce creator ownership, role changes, referenced order IDs and scoped mutation guards", async () => {
  const { state, service } = paymentHarness();
  await assert.rejects(service.recordPurchasePayment("7", { ...input, created_by: "2", role: "ADMIN" }, { ...owner, id: 3n }), error => error.status === 404);
  await assert.rejects(service.recordPurchasePayment("8", input, owner), error => error.status === 404);
  for (const role of ["SALES", "FINANCE", "GUEST", "UNKNOWN"]) await assert.rejects(service.recordPurchasePayment("7", input, { ...owner, role }), error => error.status === 403);
  assert.equal(state.payments.length, 0);
  await service.recordPurchasePayment("7", input, admin);
  assert.equal(state.payments[0].created_by, admin.id);
  assert.equal(state.guards[0].created_by, undefined);
  await assert.rejects(service.recordPurchasePayment("7", input, { ...owner, id: 3n }), error => error.status === 404);
});

test("overpayment, unreceived states, stale order guards and finance/audit failures leave no partial payment", async () => {
  for (const config of [{ failLedger: true }, { failAudit: true }, { failGuard: true }, { status: "PENDING" }, { status: "ORDERED" }, { status: "CANCELLED" }]) {
    const { state, service } = paymentHarness(config);
    await assert.rejects(service.recordPurchasePayment("7", input, owner));
    assert.equal(state.payments.length, 0);
    assert.equal(state.ledger.length, 0);
    assert.equal(state.audit.length, 0);
  }
  const { service } = paymentHarness();
  await assert.rejects(service.recordPurchasePayment("7", { ...input, amount: "1000.01" }, owner), /exceeds/);
  await assert.rejects(service.recordPurchasePayment("7", { ...input, date: "2026-09-30" }, owner), /before/);
});

test("payment validation rejects invalid dates, zero, negative, excessive precision and client identity fields", () => {
  for (const amount of ["0", "-1", "1.001", "1e3", "10000000000", 10]) assert.equal(purchasePaymentSchema.safeParse({ ...input, amount }).success, false);
  for (const date of ["2026-02-30", "2999-01-01", "bad"]) assert.equal(purchasePaymentSchema.safeParse({ ...input, date }).success, false);
  assert.equal(purchasePaymentSchema.parse({ ...input, created_by: "999" }).created_by, undefined);
});

test("stock adjustments preserve average valuation, audit cost, and the existing inventory-only ledger policy", async () => {
  let product = { id: 1n, status: "ACTIVE", stock_qty: 3, unit_cost: decimal("0.33"), inventory_value: decimal("1.00") };
  const movements = [];
  const tx = {
    products: {
      async findUnique() { return { ...product }; },
      async updateMany({ data, where }) {
        assert.equal(where.inventory_value.equals(product.inventory_value), true);
        product = { ...product, stock_qty: product.stock_qty + (data.stock_qty.increment ?? -data.stock_qty.decrement), inventory_value: data.inventory_value, unit_cost: data.unit_cost };
        return { count: 1 };
      },
    },
    inventory_movements: { async create({ data }) { const row = { id: 1n, ...data }; movements.push(row); return row; } },
    users: { async findUnique() { return owner; } },
    audit_logs: { async create() {} },
    ledger_entries: { async createMany() { assert.fail("Adjustment accounting requires separate reconciliation."); } },
  };
  const service = loadTs("src/services/adjustment.service.ts", { "@/lib/prisma": { prisma: { async $transaction(operation) { return operation(tx); } } } });
  await service.adjustStock({ productId: "1", type: "ADJUSTMENT_OUT", quantity: 1 }, owner.id);
  assert.equal(product.stock_qty, 2);
  assert.equal(product.inventory_value.toFixed(2), "0.67");
  assert.equal(movements[0].cost_amount.toFixed(2), "0.33");
  await service.adjustStock({ productId: "1", type: "ADJUSTMENT_IN", quantity: 2 }, owner.id);
  assert.equal(product.stock_qty, 4);
  assert.equal(product.inventory_value.toFixed(2), "1.34");
});

test("beginner ledger guide explains the actual cash, receipt, payment and costing workflows and limitations", () => {
  const Guide = loadTs("src/components/features/LedgerGuide.tsx").default;
  const html = renderToStaticMarkup(createElement(Guide));
  for (const content of ["Complete a cash sale", "Receive a purchase", "Record a supplier payment", "₱600", "moving weighted average", "Debits, credits and balances", "Earlier sales", "Opening inventory"]) assert.ok(html.includes(content), content);
});
