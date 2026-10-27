import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const admin = { id: 1n, name: "Admin", role: "ADMIN" };
function harness(options = {}) {
  let product = { id: 21n, sku: "ERP-0021", name: "Test product", status: "INACTIVE", stock_qty: 0, _count: { order_items: 0, purchase_items: 0, inventory_movements: 0 }, ...options.product };
  const events = [], limits = [], locks = [];
  let transactions = 0, reads = 0, verified = 0;
  const account = { id: 1n, role: "ADMIN", password_hash: "stored-hash", ...options.account };
  const tx = {
    async $queryRaw(sql) {
      locks.push(sql.join("?"));
      return sql.join("").includes("FROM users") ? [{ ...account, ...options.lockedAccount }] : [{ id: 21n }];
    },
    products: {
      async findUnique() { reads++; return options.missing ? null : product; },
      async update({ data }) { product = { ...product, ...data }; return product; },
      async delete() { const before = product; product = null; return before; },
    },
  };
  const prisma = {
    users: { async findUnique() { return account; } },
    async $transaction(operation, settings) {
      transactions++;
      assert.equal(settings.isolationLevel, "Serializable");
      const before = product, length = events.length;
      try { return await operation(tx); }
      catch (error) { product = before; events.length = length; throw error; }
    },
  };
  const service = loadTs("src/services/product-lifecycle.service.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/password": { async verifyPassword(password, hash) { verified++; assert.equal(hash, "stored-hash"); return password === "correct"; } },
    "@/lib/rate-limit": { async consumeLimit(...args) { limits.push(args); if (options.rateLimited) throw new Error("Too many requests"); } },
    "@/server/audit": { async recordAudit(_tx, actor, event) { assert.equal(actor.id, admin.id); if (options.auditFailure) throw new Error("Audit unavailable"); events.push(event); } },
  });
  return { ...service, events, limits, locks, get product() { return product; }, get transactions() { return transactions; }, get reads() { return reads; }, get verified() { return verified; } };
}

test("archive keeps stock, SKU and relationships, requires stock acknowledgement, and can be restored", async () => {
  const state = harness({ product: { status: "ACTIVE", stock_qty: 50, _count: { order_items: 50, purchase_items: 2, inventory_movements: 52 } } });
  await assert.rejects(state.changeProductLifecycle("21", { action: "archive" }, admin), /50 units.*Acknowledge/);
  assert.equal(state.product.status, "ACTIVE");
  await state.changeProductLifecycle("21", { action: "archive", acknowledgeStock: true }, admin);
  assert.equal(state.product.status, "INACTIVE");
  assert.equal(state.product.stock_qty, 50);
  assert.equal(state.product.sku, "ERP-0021");
  assert.equal(state.product._count.order_items, 50);
  await state.changeProductLifecycle("21", { action: "restore" }, admin);
  assert.equal(state.product.status, "ACTIVE");
  assert.deepEqual(state.events.map(event => event.action), ["PRODUCT_ARCHIVED", "PRODUCT_RESTORED"]);
  assert.ok(state.locks.every(sql => sql.includes("FOR UPDATE")));
});

test("inventory staff can archive and restore; read-only roles and guests cannot", async () => {
  for (const role of ["SALES", "FINANCE", "GUEST", "unknown"]) {
    const state = harness();
    await assert.rejects(state.changeProductLifecycle("21", { action: "restore" }, { ...admin, role }), /role does not allow/);
    assert.equal(state.transactions, 0);
  }
  const state = harness();
  await state.changeProductLifecycle("21", { action: "restore" }, { ...admin, role: "INVENTORY" });
  assert.equal(state.product.status, "ACTIVE");
});

test("deletion requires admin and the current password with per-user throttling", async () => {
  for (const role of ["INVENTORY", "SALES", "FINANCE", "GUEST"]) {
    const state = harness();
    await assert.rejects(state.permanentlyDeleteProduct("21", { password: "correct", role: "ADMIN" }, { ...admin, role }), /Only an administrator/);
    assert.equal(state.transactions, 0);
    assert.equal(state.verified, 0);
  }
  const state = harness();
  await assert.rejects(state.permanentlyDeleteProduct("21", { password: "wrong" }, admin), /password is incorrect/);
  assert.equal(state.transactions, 0);
  assert.deepEqual(state.limits[0], ["product-delete-password:1", 5, 900]);
  assert.equal(state.product.id, 21n);
  const limited = harness({ rateLimited: true });
  await assert.rejects(limited.permanentlyDeleteProduct("21", { password: "correct" }, admin), /Too many/);
  assert.equal(limited.verified, 0);
});

test("deletion blocks stock and every kind of business reference, including pending order lines", async () => {
  for (const [product, message] of [
    [{ status: "ACTIVE" }, /Archive this product/],
    [{ stock_qty: 1 }, /current inventory/],
    [{ _count: { order_items: 1 } }, /sales history/],
    [{ _count: { purchase_items: 1 } }, /purchase history/],
    [{ _count: { inventory_movements: 1 } }, /stock movements/],
  ]) {
    const state = harness({ product });
    await assert.rejects(state.permanentlyDeleteProduct("21", { password: "correct" }, admin), message);
    assert.ok(state.product);
    assert.equal(state.events.length, 0);
  }
});

test("only unused zero-stock archived products are deleted; audit is preserved atomically", async () => {
  const state = harness();
  const result = await state.permanentlyDeleteProduct("21", { password: "correct" }, admin);
  assert.equal(result.id, "21");
  assert.equal(state.product, null);
  assert.equal(state.events[0].action, "PRODUCT_DELETED");
  assert.equal(state.events[0].before.sku, "ERP-0021");
  assert.equal(JSON.stringify(state.events, (_, value) => typeof value === "bigint" ? String(value) : value).includes("correct"), false);
  assert.match(state.locks[0], /users.*FOR SHARE/);
  assert.match(state.locks[1], /products.*FOR UPDATE/);
  for (const action of ["delete", "archive"]) {
    const failed = harness({ auditFailure: true, product: { status: action === "archive" ? "ACTIVE" : "INACTIVE" } });
    await assert.rejects(action === "delete" ? failed.permanentlyDeleteProduct("21", { password: "correct" }, admin) : failed.changeProductLifecycle("21", { action: "archive" }, admin), /Audit unavailable/);
    assert.ok(failed.product);
    assert.equal(failed.product.status, action === "archive" ? "ACTIVE" : "INACTIVE");
  }
});

test("password changes, demotion, missing IDs and invalid lifecycle transitions fail safely", async () => {
  for (const lockedAccount of [{ role: "INVENTORY" }, { password_hash: "changed" }]) {
    const state = harness({ lockedAccount });
    await assert.rejects(state.permanentlyDeleteProduct("21", { password: "correct" }, admin), /account changed/);
    assert.equal(state.reads, 0);
  }
  const demoted = harness({ account: { role: "INVENTORY" } });
  await assert.rejects(demoted.permanentlyDeleteProduct("21", { password: "correct" }, admin), /Only an administrator/);
  assert.equal(demoted.verified, 0);
  for (const operation of ["delete", "restore"]) {
    const missing = harness({ missing: true });
    await assert.rejects(operation === "delete" ? missing.permanentlyDeleteProduct("21", { password: "correct" }, admin) : missing.changeProductLifecycle("21", { action: "restore" }, admin), /not found/);
  }
  const state = harness();
  await assert.rejects(state.changeProductLifecycle("21", { action: "archive" }, admin), /already archived/);
  await assert.rejects(state.changeProductLifecycle("not-an-id", { action: "restore" }, admin));
  await assert.rejects(state.permanentlyDeleteProduct("21", { password: "" }, admin));
});

test("editing cannot bypass archive and restore safeguards", async () => {
  const { updateProduct } = loadTs("src/services/inventory.service.ts", {
    "@/lib/prisma": { prisma: { async $transaction(operation) { return operation({ products: { async findUnique() { return { status: "ACTIVE" }; }, async update() { assert.fail("Status bypass"); } } }); } } },
  });
  await assert.rejects(updateProduct("21", { name: "Test", unitCost: "5", sellingPrice: "6", status: "INACTIVE" }, admin.id), /Archive or Restore/);
});
