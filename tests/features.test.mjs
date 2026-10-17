import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const { canAccess, canWrite } = loadTs("src/lib/access.ts");
const { transactionSchema, moneySchema, idSchema } = loadTs("src/validations/shared.ts");
const { orderSchema } = loadTs("src/validations/order.schema.ts");
const { filterFeatureRows, philippineDate, csvCell } = loadTs("src/lib/feature-list.ts");
const { toMinorUnits, fromMinorUnits, sumMoney } = loadTs("src/lib/money.ts");
const { nextStatus } = loadTs("src/lib/workflow.ts");
const { stockDelta } = loadTs("src/lib/stock.ts");

test("sales dates allow today and past dates but reject future dates; planned purchases remain allowed", () => {
  const now = new Date();
  const today = philippineDate(now.toISOString());
  const tomorrow = philippineDate(new Date(now.getTime() + 86400000).toISOString());
  const order = { partyId: "1", items: [{ productId: "2", quantity: 1 }] };
  assert.equal(orderSchema.safeParse({ ...order, date: today }).success, true);
  assert.equal(orderSchema.safeParse({ ...order, date: "2000-01-01" }).success, true);
  const result = orderSchema.safeParse({ ...order, date: tomorrow });
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /cannot be in the future/);
  assert.equal(transactionSchema.safeParse({ ...order, date: tomorrow }).success, true);
  assert.equal(philippineDate("2026-10-11T16:00:00Z"), "2026-10-12");
});

test("sales require exactly one registered customer or a valid walk-in name", () => {
  const order = { date: "2026-10-10", items: [{ productId: "2", quantity: 1 }] };
  assert.equal(orderSchema.safeParse({ ...order, partyId: "1" }).success, true);
  assert.equal(orderSchema.parse({ ...order, walkInCustomer: { name: "  Buyer  " } }).walkInCustomer.name, "Buyer");
  for (const customer of [{}, { partyId: "1", walkInCustomer: { name: "Buyer" } }, { walkInCustomer: { name: "   " } }, { walkInCustomer: { name: "a".repeat(151) } }, { partyId: "0" }]) {
    assert.equal(orderSchema.safeParse({ ...order, ...customer }).success, false);
  }
});

test("roles enforce module access and sales has read-only inventory", () => {
  assert.equal(canAccess("SALES", "inventory"), true);
  assert.equal(canWrite("SALES", "inventory"), false);
  assert.equal(canWrite("INVENTORY", "purchasing"), true);
  assert.equal(canAccess("FINANCE", "sales"), false);
  assert.equal(canAccess("unknown", "settings"), false);
  for (const feature of ["sales", "customers", "inventory", "purchasing", "suppliers", "finance", "reports", "settings"]) assert.equal(canWrite("ADMIN", feature), true);
});
test("decimal totals preserve cents and support negative differences", () => {
  assert.equal(sumMoney(["0.10", "0.20"]), "0.30");
  assert.equal(sumMoney(["9999999999.99", "0.01"]), "10000000000.00");
  assert.equal(fromMinorUnits(toMinorUnits("0.01") - toMinorUnits("1.00")), "-0.99");
});
test("validation rejects duplicate lines, invalid dates, quantities and oversized IDs", () => {
  const input = { partyId: "1", date: "2026-10-10", items: [{ productId: "2", quantity: 1 }] };
  assert.equal(transactionSchema.safeParse(input).success, true);
  for (const bad of [{ ...input, date: "2026-02-30" }, { ...input, items: [...input.items, ...input.items] }, { ...input, items: [{ productId: "2", quantity: 1.5 }] }, { ...input, items: [] }]) assert.equal(transactionSchema.safeParse(bad).success, false);
  for (const amount of ["-1", "Infinity", "0.001", "10000000000.00", "", "1e2"]) assert.equal(moneySchema.safeParse(amount).success, false);
  assert.equal(idSchema.safeParse("9223372036854775808").success, false);
  for (const id of ["abc", "0", "-1", "", "1.2"]) assert.equal(idSchema.safeParse(id).success, false);
});
test("workflow rejects skipped, repeated, cancelled and final transitions", () => {
  assert.equal(nextStatus("sales", "PENDING", "confirm"), "CONFIRMED");
  assert.equal(nextStatus("sales", "CONFIRMED", "complete"), "COMPLETED");
  assert.equal(nextStatus("purchasing", "PENDING", "confirm"), "ORDERED");
  assert.equal(nextStatus("purchasing", "ORDERED", "complete"), "RECEIVED");
  for (const [kind, status, action] of [["sales", "PENDING", "complete"], ["sales", "COMPLETED", "complete"], ["purchasing", "RECEIVED", "cancel"], ["sales", "CANCELLED", "confirm"]]) assert.throws(() => nextStatus(kind, status, action));
});
test("report filters combine exact status, search and Philippine date boundaries", () => {
  const rows = [{ id: "1", name: "ABC", status: "COMPLETED", timestamp: "2026-10-09T16:00:00Z" }, { id: "2", name: "ABC", status: "PENDING", timestamp: "2026-10-09T15:59:59Z" }];
  assert.equal(philippineDate(rows[0].timestamp), "2026-10-10");
  const filtered = filterFeatureRows(rows, { query: " abc ", status: "COMPLETED", from: "2026-10-10", to: "2026-10-10" }, row => row.name, row => row.status, row => row.timestamp);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "1");
  assert.equal(filterFeatureRows(rows, { from: "2026-10-11", to: "2026-10-10" }, row => row.name, row => row.status, row => row.timestamp).length, 0);
});
test("CSV protects formula-like cells and escapes quotes", () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
});
test("movement direction is derived from type, without changing positive storage", () => {
  assert.equal(stockDelta("SALE", 5), -5);
  assert.equal(stockDelta("ADJUSTMENT_OUT", 5), -5);
  assert.equal(stockDelta("PURCHASE", 5), 5);
  assert.equal(stockDelta("ADJUSTMENT_IN", 5), 5);
});


test("guests can view every module and cannot mutate any module", () => {
  for (const feature of ["sales", "customers", "inventory", "purchasing", "suppliers", "finance", "reports", "settings"]) {
    assert.equal(canAccess("GUEST", feature), true);
    assert.equal(canWrite("GUEST", feature), false);
  }
});
