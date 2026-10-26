import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const path = new URL("../src/server/demo/guest-snapshot.json", import.meta.url);
const snapshot = JSON.parse(readFileSync(path, "utf8"));

test("the bundled snapshot identifies its source and capture time and excludes credentials and session data", () => {
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.source, "erp_lite");
  assert.ok(Number.isFinite(Date.parse(snapshot.capturedAt)));
  assert.deepEqual(Object.keys(snapshot.data).sort(), ["customers", "ledger", "movements", "products", "purchases", "sales", "suppliers"]);
  const forbidden = /password|hash|token|secret|database_url|session/i;
  function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.test(key), false, key); inspect(child); }
  }
  inspect(snapshot);
  assert.doesNotMatch(JSON.stringify(snapshot), /postgres(?:ql)?:\/\//i);
});

test("legacy snapshots retain missing payment and valuation history instead of inventing it", () => {
  const { createGuestData } = loadTs("src/server/demo/guest-data.ts");
  const data = createGuestData();
  if (!snapshot.capabilities.purchasePayments) assert.ok(data.purchases.every(row => row.payments === undefined));
  if (!snapshot.capabilities.inventoryValuation) assert.ok(data.products.every(row => row.inventoryValue === undefined));
  if (data.sales[0]?.items[0]) {
    const expected = data.sales[0].items[0].unitPrice;
    data.sales[0].items[0].unitPrice = "0.00";
    assert.equal(createGuestData().sales[0].items[0].unitPrice, expected);
  }
});

test("export rejects missing, malformed and unapproved source connections without leaking credentials or replacing the snapshot", () => {
  const before = readFileSync(path, "utf8");
  const marker = "never-print-this-credential";
  for (const source of ["", marker, `postgresql://user:${marker}@localhost:5432/private_records`]) {
    const result = spawnSync(process.execPath, ["scripts/export-guest-snapshot.mjs"], {
      encoding: "utf8", env: { ...process.env, GUEST_DATABASE_URL: source }, windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.equal((result.stdout + result.stderr).includes(marker), false);
    assert.equal(readFileSync(path, "utf8"), before);
  }
});
