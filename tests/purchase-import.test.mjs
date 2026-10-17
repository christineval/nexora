import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const { parsePurchaseText, matchImportProduct } = loadTs("src/lib/purchase-import.ts");
const products = [
  { productId: "1", name: "Keyboard", sku: "P001", size: null, status: "ACTIVE" },
  { productId: "2", name: "Mouse", sku: "P002", size: null, status: "ACTIVE" },
];

test("invoice parsing extracts multiple products, whole quantities and decimal prices without floating point totals", () => {
  const rows = parsePurchaseText("Supplier Ltd\nKeyboard 3 0.10 0.30\n2 Mouse 1,200.50 2,401.00\nTOTAL 2 1.00 2.00", products);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].productId, "1");
  assert.equal(rows[0].unitPrice, "0.10");
  assert.equal(rows[0].warning, "");
  assert.equal(rows[1].productId, "2");
  assert.equal(rows[1].quantity, "2");
  assert.equal(rows[1].unitPrice, "1200.50");
});

test("uncertain products and inconsistent totals require review; ambiguous layouts are not assigned guessed quantities", () => {
  const rows = parsePurchaseText("Unknown widget 2 12.00 25.00\nKeyboard 12.00\nKeyboard 0 10.00 0.00", products);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].productId, "");
  assert.match(rows[0].warning, /Select the matching product/);
  assert.match(rows[0].warning, /printed line total/);
  assert.match(rows[1].warning, /quantity/);
});

test("product matching uses unique active exact names or SKUs and never creates inventory records", () => {
  assert.equal(matchImportProduct("p001", products), "1");
  assert.equal(matchImportProduct(" Keyboard ", products), "1");
  assert.equal(matchImportProduct("Keyboar", products), "");
  assert.equal(matchImportProduct("Keyboard", [...products, { ...products[0], productId: "3" }]), "");
  assert.equal(matchImportProduct("Keyboard", [{ ...products[0], status: "INACTIVE" }]), "");
});
