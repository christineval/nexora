import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { loadTs } from "./load-ts.mjs";

const owner = { id: 1n, name: "Owner", role: "SALES" };
const admin = { id: 9n, name: "Admin", role: "ADMIN" };
const input = { partyId: "1", date: "2026-10-10", items: [{ productId: "1", quantity: 1 }] };

function harness(kind) {
  const writes = [];
  const rows = [1n, 2n].map(id => ({
    id, created_by: id, status: "PENDING", customer_id: 1n, supplier_id: 1n,
    order_date: new Date(), purchase_date: new Date(),
    total_amount: new Prisma.Decimal(1), subtotal: new Prisma.Decimal(1), tax: new Prisma.Decimal(0),
    customers: { name: "Customer" }, suppliers: { name: "Supplier" }, users: { name: "Creator" }, purchase_payments: [],
    [kind === "sales" ? "order_items" : "purchase_items"]: [{
      id: 1n, product_id: 1n, quantity: 1, unit_price: new Prisma.Decimal(1), line_total: new Prisma.Decimal(1), products: { name: "Product", sku: "ERP-0001" },
    }],
  }));
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const model = {
    async findMany({ where }) { return rows.filter(row => matches(row, where)); },
    async findUnique({ where }) { return rows.find(row => matches(row, where)) ?? null; },
    async updateMany({ where, data }) {
      const row = rows.find(row => matches(row, where));
      if (!row) return { count: 0 };
      writes.push({ model: "header", where, data });
      Object.assign(row, data);
      return { count: 1 };
    },
    async create({ data }) { writes.push({ model: "header", data }); return { id: 3n }; },
  };
  const items = { async deleteMany() { writes.push({ model: "items" }); }, async createMany() { writes.push({ model: "items" }); } };
  const tx = {
    audit_logs: { async create() {} },
    orders: model, purchase_orders: model, order_items: items, purchase_items: items,
    customers: { async findUnique() { return { id: 1n, status: "ACTIVE" }; }, async create() { assert.fail("Unauthorized walk-in creation"); } },
    suppliers: { async findUnique() { return { id: 1n, status: "ACTIVE" }; } },
    products: {
      async findUnique() { return { id: 1n, status: "ACTIVE", name: "Product", stock_qty: 10, unit_cost: new Prisma.Decimal(1), inventory_value: new Prisma.Decimal(10) }; },
      async findMany() { return [{ id: 1n, name: "Product", stock_qty: 10, selling_price: new Prisma.Decimal(1), unit_cost: new Prisma.Decimal(1) }]; },
      async updateMany() { writes.push({ model: "stock" }); return { count: 1 }; },
    },
    inventory_movements: { async create({ data }) { writes.push({ model: "movement", data }); } },
    ledger_entries: { async createMany({ data }) { writes.push({ model: "ledger", data }); } },
  };
  const prisma = { ...tx, async $transaction(operation) { return operation(tx); } };
  const mocks = { "@/lib/prisma": { prisma }, "@/lib/errors": loadTs("src/lib/errors.ts") };
  return { rows, writes, mocks, service: loadTs("src/services/transaction.service.ts", mocks) };
}

for (const kind of ["sales", "purchasing"]) {
  const user = { ...owner, role: kind === "sales" ? "SALES" : "INVENTORY" };

  test(`${kind}: lists and legacy detail readers exclude other creators, while admins see all`, async () => {
    const { service, mocks } = harness(kind);
    assert.deepEqual((await service.listTransactions(kind, user)).map(row => row.id), ["1"]);
    assert.deepEqual((await service.listTransactions(kind, admin)).map(row => row.id), ["1", "2"]);
    const legacy = loadTs(`src/services/${kind === "sales" ? "sales" : "purchasing"}.service.ts`, mocks);
    const get = kind === "sales" ? legacy.getOrder : legacy.getPurchase;
    assert.equal(await get("2", user), null);
    assert.equal((await get("2", admin)).id, "2");
    // Finance report access still carries the creator restriction.
    assert.deepEqual((await service.listTransactions(kind, { ...owner, role: "FINANCE" })).map(row => row.id), ["1"]);
  });

  test(`${kind}: swapped object IDs cannot edit or transition another creator's order`, async () => {
    const { service, writes } = harness(kind);
    const edit = kind === "sales" ? { ...input, partyId: undefined, walkInCustomer: { name: "Blocked buyer" } } : input;
    await assert.rejects(service.editTransaction(kind, "2", edit, user), error => error.status === 404);
    for (const action of ["confirm", "complete", "cancel"]) await assert.rejects(service.transitionTransaction(kind, "2", action, user), error => error.status === 404);
    await assert.rejects(service.transitionTransaction(kind, "99", "cancel", user), error => error.status === 404);
    assert.equal(writes.length, 0);
  });

  test(`${kind}: owners can edit and complete their orders; admins can act across creators`, async () => {
    const { service, writes } = harness(kind);
    await service.editTransaction(kind, "1", { ...input, created_by: "2", userId: "2", role: "ADMIN" }, user);
    assert.equal(writes[0].where.created_by, user.id);
    assert.equal(Object.hasOwn(writes[0].data, "created_by"), false);
    await service.transitionTransaction(kind, "1", "confirm", user);
    await service.transitionTransaction(kind, "1", "complete", user);
    assert.equal(writes.find(row => row.model === "movement").data.created_by, user.id);
    await service.transitionTransaction(kind, "2", "cancel", admin);
    assert.equal(writes.at(-1).data.status, "CANCELLED");
    assert.equal(Object.hasOwn(writes.at(-1).where, "created_by"), false);
    await service.createTransaction(kind, { ...input, created_by: "2", userId: "2", role: "ADMIN" }, user);
    assert.equal(writes.at(-1).data.created_by, user.id);
  });

  test(`${kind}: request-body roles and creator IDs cannot grant cross-user access through PATCH`, async () => {
    const { service, writes, mocks } = harness(kind);
    const path = kind === "sales" ? "orders" : "purchases";
    const route = loadTs(`src/app/api/${path}/[id]/route.ts`, {
      "@/lib/errors": mocks["@/lib/errors"],
      "@/lib/auth": { async requireUser() { return user; } },
      "@/services/transaction.service": service,
      "@/lib/rate-limit": { async limitRequest() {}, RateLimitError: class extends Error {} },
    });
    const response = await route.PATCH(new Request(`https://example.com/api/${path}/2`, {
      method: "PATCH", headers: { Origin: "https://example.com" }, body: JSON.stringify({ action: "confirm", role: "ADMIN", created_by: "1", userId: "2" }),
    }), { params: Promise.resolve({ id: "2" }) });
    assert.equal(response.status, 404);
    assert.equal(writes.length, 0);
  });
}

test("dashboard scopes completed totals and recent order queries to the session creator", async () => {
  const queries = [];
  const tx = {
    audit_logs: { async create() {} },
    products: { async count(query) { assert.equal(query?.where?.created_by, undefined); return 0; } },
    orders: { async findMany(query) { queries.push(query); return []; } },
    purchase_orders: { async findMany(query) { queries.push(query); return []; } },
  };
  const service = loadTs("src/services/dashboard.service.ts", { "@/lib/prisma": { prisma: { async $transaction(operation) { return operation(tx); } } } });
  await service.getDashboardMetrics(owner, { includeRecentOrders: true });
  assert.equal(queries.length, 3);
  for (const query of queries) assert.equal(query.where.created_by, owner.id);
  queries.length = 0;
  await service.getDashboardMetrics(admin, { includeRecentOrders: true });
  for (const query of queries) assert.equal(Object.hasOwn(query.where, "created_by"), false);
});

test("order services reject unauthorized module access even when called directly", async () => {
  const { service, writes } = harness("sales");
  for (const user of [{ ...owner, role: "GUEST" }, { ...owner, role: "unknown" }, { ...owner, role: "INVENTORY" }]) {
    await assert.rejects(service.listTransactions("sales", user), error => error.status === 403);
    await assert.rejects(service.createTransaction("sales", input, user), error => error.status === 403);
    await assert.rejects(service.editTransaction("sales", "1", input, user), error => error.status === 403);
    await assert.rejects(service.transitionTransaction("sales", "1", "cancel", user), error => error.status === 403);
  }
  assert.equal(writes.length, 0);
});
