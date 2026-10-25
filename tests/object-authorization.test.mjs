import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const endpoints = [
  ["products", "inventory"], ["customers", "customers"], ["suppliers", "suppliers"],
  ["orders", "sales"], ["purchases", "purchasing"], ["users", "settings"],
];

function harness() {
  let identity = null;
  const mocks = {
    "@/server/audit": { async recordSecurityEvent() {} },
    "@/lib/rate-limit": { async limitRequest() {}, RateLimitError: class extends Error {} },
    "@/lib/session-store": { async readSession() { return identity; } },
    "next/headers": { async cookies() { return { get() { return { value: "a".repeat(43) }; } }; } },
    "next/navigation": { redirect(path) { throw new Error(path); } },
    "@/server/data/erp-data": new Proxy({}, { get() { return () => assert.fail("Unauthorized object lookup"); } }),
  };
  for (const name of ["@/lib/prisma", ...["inventory", "contact", "transaction", "purchase-invoice", "product-lifecycle", "user", "adjustment"].map(name => `@/services/${name}.service`)]) {
    Object.defineProperty(mocks, name, { get() { assert.fail(`Unauthorized request reached protected data: ${name}`); } });
  }
  return { mocks, setIdentity(user) { identity = user; } };
}

function request(path, method) {
  return new Request(`https://example.com/api/${path}`, {
    method, headers: { Origin: "https://example.com" },
    ...(method === "GET" ? {} : { body: JSON.stringify({ role: "ADMIN", userId: "1", created_by: "1", action: "complete" }) }),
  });
}

test("every protected mutation rejects anonymous users, wrong roles and guest writes before object access", async () => {
  const { mocks, setIdentity } = harness();
  const { canWrite } = loadTs("src/lib/access.ts");
  for (const role of [null, "SALES", "INVENTORY", "FINANCE", "GUEST", "unknown"]) {
    setIdentity(role ? { id: 999n, name: "Actor", role } : null);
    for (const [path, module] of [...endpoints, ["inventory/adjustments", "inventory"], ["purchases/import", "purchasing"]]) {
      if (role && canWrite(role, module)) continue;
      const route = loadTs(`src/app/api/${path}/route.ts`, mocks);
      assert.equal((await route.POST(request(path, "POST"))).status, role ? 403 : 401, `${role} POST ${path}`);
      if (path === "inventory/adjustments" || path === "purchases/import") continue;
      const detail = loadTs(`src/app/api/${path}/[id]/route.ts`, mocks);
      for (const id of ["1", "9223372036854775807"]) {
        const response = await detail.PATCH(request(`${path}/${id}`, "PATCH"), { params: Promise.resolve({ id }) });
        assert.equal(response.status, role ? 403 : 401, `${role} PATCH ${path}/${id}`);
      }
    }
  }
});

test("product lifecycle routes reject guests, read-only roles and non-admin deletion before service access", async () => {
  const { mocks, setIdentity } = harness();
  const lifecycle = loadTs("src/app/api/products/[id]/lifecycle/route.ts", mocks);
  const detail = loadTs("src/app/api/products/[id]/route.ts", mocks);
  for (const role of [null, "GUEST", "SALES", "FINANCE", "INVENTORY", "unknown"]) {
    setIdentity(role ? { id: 99n, name: "Actor", role } : null);
    for (const id of ["1", "9223372036854775807"]) {
      const params = { params: Promise.resolve({ id }) };
      assert.equal((await detail.DELETE(request(`products/${id}`, "DELETE"), params)).status, role ? 403 : 401);
      if (role !== "INVENTORY") assert.equal((await lifecycle.POST(request(`products/${id}/lifecycle`, "POST"), params)).status, role ? 403 : 401);
    }
  }
});

test("protected collection and detail reads reject unauthorized identities before object lookup", async () => {
  const { mocks, setIdentity } = harness();
  const { canAccess } = loadTs("src/lib/access.ts");
  // Data modules may be imported eagerly; invoking a selector must still be blocked.
  Object.defineProperty(mocks, "@/server/data/erp-data", { configurable: true, value: new Proxy({}, { get() { return () => assert.fail("Unauthorized object lookup"); } }) });
  for (const role of [null, "SALES", "INVENTORY", "FINANCE", "unknown"]) {
    setIdentity(role ? { id: 999n, name: "Actor", role } : null);
    for (const [path, module] of endpoints) {
      if (role && canAccess(role, module)) continue;
      const route = loadTs(`src/app/api/${path}/route.ts`, mocks);
      assert.equal((await route.GET(request(path, "GET"))).status, role ? 403 : 401);
      if (!["products", "customers", "suppliers"].includes(path)) continue;
      const detail = loadTs(`src/app/api/${path}/[id]/route.ts`, mocks);
      assert.equal((await detail.GET(request(`${path}/1`, "GET"), { params: Promise.resolve({ id: "1" }) })).status, role ? 403 : 401);
    }
  }
});
