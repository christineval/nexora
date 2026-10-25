import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const { createGuestData } = loadTs("src/server/demo/guest-data.ts");
const { sumMoney, toMinorUnits } = loadTs("src/lib/money.ts");
const { stockDelta } = loadTs("src/lib/stock.ts");

function isolatedMocks() {
  const mocks = { "@/lib/rate-limit": { async limitRequest() {}, RateLimitError: class extends Error {} } };
  for (const moduleName of ["@/lib/prisma", ...["inventory", "contact", "transaction", "finance", "user", "dashboard", "adjustment"].map(name => `@/services/${name}.service`)]) {
    Object.defineProperty(mocks, moduleName, { enumerable: true, get() { assert.fail(`Guest imported database code: ${moduleName}`); } });
  }
  return mocks;
}

async function guestHarness(t) {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "isolated-guest-test-secret-at-least-32-characters";
  t.after(() => { if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous; });
  const jar = new Map();
  const mocks = isolatedMocks();
  mocks["@/lib/errors"] = loadTs("src/lib/errors.ts");
  mocks["next/headers"] = { async cookies() { return { get: name => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name, value) => jar.set(name, value), delete: name => jar.delete(name) }; } };
  mocks["next/navigation"] = { redirect(path) { throw new Error("redirect:" + path); }, notFound() { throw new Error("not-found"); } };
  const auth = loadTs("src/lib/auth.ts", mocks);
  await auth.createGuestSession();
  mocks["@/lib/auth"] = auth;
  return { mocks, guest: await auth.getCurrentUser(), auth };
}

test("guest mock data is internally consistent across transactions, stock, finance, and dashboard", () => {
  const data = createGuestData(new Date("2026-10-12T04:00:00Z"));
  const again = createGuestData(new Date("2026-10-12T04:00:00Z"));
  assert.equal(JSON.stringify(data), JSON.stringify(again));
  const ids = data.products.map(row => row.productId);
  for (const [kind, rows] of [["sales", data.sales], ["purchases", data.purchases]]) {
    const parties = kind === "sales" ? data.customers : data.suppliers;
    for (const row of rows) {
      assert.equal(parties.find(party => party.id === row.partyId).name, row.party);
      assert.equal(row.total, sumMoney(row.items.map(item => item.lineTotal)));
      for (const item of row.items) {
        assert.equal(ids.includes(item.productId), true);
        assert.equal(toMinorUnits(item.lineTotal), toMinorUnits(item.unitPrice) * BigInt(item.quantity));
      }
    }
  }
  for (const product of data.products) {
    const stock = data.movements.filter(row => row.productId === product.productId).reduce((sum, row) => sum + stockDelta(row.type, row.quantity), 0);
    assert.equal(product.stockQty, stock);
    assert.ok(stock >= 0);
  }
  assert.equal(sumMoney(data.ledger.filter(row => row.type === "DEBIT").map(row => row.amount)), sumMoney(data.ledger.filter(row => row.type === "CREDIT").map(row => row.amount)));
  assert.equal(data.dashboard.totalSales, Number(sumMoney(data.sales.filter(row => row.status === "COMPLETED").map(row => row.total))));
  assert.equal(data.dashboard.totalPurchases, Number(sumMoney(data.purchases.filter(row => row.status === "RECEIVED").map(row => row.total))));
  assert.equal(data.dashboard.recentOrders.length, 4);
  assert.ok(data.users.every(row => row.email.endsWith("@nexora-demo.example") && !Object.keys(row).includes("password_hash")));
  data.products[0].name = "Changed";
  assert.notEqual(createGuestData().products[0].name, "Changed");
});

test("all guest data selectors avoid loading Prisma or database services, including unknown IDs", async t => {
  const { mocks, guest } = await guestHarness(t);
  const data = loadTs("src/server/data/erp-data.ts", mocks);
  assert.ok((await data.listProducts(guest))[0].sku.startsWith("DEMO-"));
  assert.equal((await data.getProduct(guest, "920001")).name, "Demo Notebook");
  assert.equal(await data.getProduct(guest, "1"), null);
  assert.equal(await data.getNextProductSku(guest), "");
  assert.ok((await data.listInventoryMovements(guest)).length);
  for (const kind of ["customers", "suppliers"]) assert.ok((await data.listContacts(guest, kind))[0].name.startsWith("Demo "));
  for (const kind of ["sales", "purchasing"]) assert.ok((await data.listTransactions(guest, kind))[0].party.startsWith("Demo "));
  assert.ok((await data.listLedgerEntries(guest)).length);
  assert.equal((await data.listUsers(guest)).length, 4);
  assert.equal((await data.getDashboardMetrics(guest)).recentOrders.length, 0);
  assert.equal((await data.getDashboardMetrics(guest, { includeRecentOrders: true })).recentOrders.length, 4);
});

test("member selectors still delegate to the existing live services", async () => {
  const calls = [];
  const service = Object.fromEntries(["listProducts", "getProduct", "getNextProductSku", "listInventoryMovements", "listContacts", "listTransactions", "listLedgerEntries", "listUsers", "getDashboardMetrics"].map(name => [name, async (...args) => { calls.push({ name, args }); return "live-result"; }]));
  const mocks = Object.fromEntries(["inventory", "contact", "transaction", "finance", "user", "dashboard"].map(name => [`@/services/${name}.service`, service]));
  const data = loadTs("src/server/data/erp-data.ts", mocks);
  const member = { id: 1n, name: "Member", role: "ADMIN" };
  for (const name of ["listProducts", "getNextProductSku", "listInventoryMovements", "listLedgerEntries", "listUsers"]) assert.equal(await data[name](member), "live-result");
  assert.equal(await data.getProduct(member, "1"), "live-result");
  assert.equal(await data.listContacts(member, "customers"), "live-result");
  assert.equal(await data.listTransactions(member, "sales"), "live-result");
  assert.equal(await data.getDashboardMetrics(member, { includeRecentOrders: true }), "live-result");
  assert.equal(calls.length, 9);
  assert.equal(calls.find(call => call.name === "listTransactions").args[1], member);
  assert.equal(calls.find(call => call.name === "getDashboardMetrics").args[0], member);
});

test("guest read APIs return demo records, reject unknown detail IDs, and block every mutation before database imports", async t => {
  const { mocks } = await guestHarness(t);
  for (const route of ["products", "customers", "suppliers", "orders", "purchases", "users"]) {
    const api = loadTs(`src/app/api/${route}/route.ts`, mocks);
    const response = await api.GET(new Request(`http://localhost:3000/api/${route}`));
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.ok(rows.length > 0);
    assert.ok(JSON.stringify(rows).includes("Demo "));
    const denied = await api.POST(new Request(`http://localhost:3000/api/${route}`, { method: "POST", headers: { Origin: "http://localhost:3000" }, body: "{}" }));
    assert.equal(denied.status, 403);
  }
  for (const [route, id] of [["products", "920001"], ["customers", "930001"], ["suppliers", "940001"]]) {
    const api = loadTs(`src/app/api/${route}/[id]/route.ts`, mocks);
    assert.equal((await api.GET(new Request(`http://localhost:3000/api/${route}`), { params: Promise.resolve({ id }) })).status, 200);
    assert.equal((await api.GET(new Request(`http://localhost:3000/api/${route}`), { params: Promise.resolve({ id: "1" }) })).status, 404);
  }
  for (const route of ["products", "customers", "suppliers", "orders", "purchases", "users"]) {
    const api = loadTs(`src/app/api/${route}/[id]/route.ts`, mocks);
    assert.equal((await api.PATCH(new Request(`http://localhost:3000/api/${route}/1`, { method: "PATCH", headers: { Origin: "http://localhost:3000" }, body: "{}" }), { params: Promise.resolve({ id: "1" }) })).status, 403);
  }
  for (const route of ["inventory/adjustments", "auth/password", "purchases/import"]) {
    const api = loadTs(`src/app/api/${route}/route.ts`, mocks);
    assert.equal((await api.POST(new Request(`http://localhost:3000/api/${route}`, { method: "POST", headers: { Origin: "http://localhost:3000" }, body: "{}" }))).status, 403);
  }
});

test("guest pages and histories render without database imports and never fall back to live IDs", async t => {
  const { mocks } = await guestHarness(t);
  const routes = ["dashboard", "customers", "suppliers", "sales", "purchasing", "inventory/products", "inventory/movements", "finance/ledger", "reports/sales", "reports/purchases", "reports/inventory", "settings", "settings/users", "customers/[id]", "suppliers/[id]", "sales/[id]", "purchasing/[id]", "inventory/products/[id]", "sales/new", "purchasing/new"];
  mocks["next/link"] = { __esModule: true, default: () => null };
  for (const route of routes) {
    const source = readFileSync(`src/app/(erp)/${route}/page.tsx`, "utf8");
    for (const match of source.matchAll(/from "(@\/components\/[^"]+)"/g)) mocks[match[1]] = { __esModule: true, default: () => null };
  }
  const ids = { "customers/[id]": "930001", "suppliers/[id]": "940001", "sales/[id]": "900001", "purchasing/[id]": "910001", "inventory/products/[id]": "920001" };
  for (const route of routes) {
    const { default: Page } = loadTs(`src/app/(erp)/${route}/page.tsx`, mocks);
    const props = { searchParams: Promise.resolve({}), params: Promise.resolve({ id: ids[route] ?? "1" }) };
    assert.ok(await Page(props));
    if (route.endsWith("/[id]")) await assert.rejects(Page({ ...props, params: Promise.resolve({ id: "1" }) }), /not-found/);
  }
});
