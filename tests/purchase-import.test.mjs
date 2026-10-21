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

test("barcode and discount columns are separated from names and missing quantities stay blank", () => {
  const rows = parsePurchaseText(`DESCRIPTIONS BARCODE DISC. UNIT PRICE TOTAL
PCS EPSON INK REFILL 65ML 003 T00V L-EIR65-T00V1 0.00 340.00 340.00
REAM HARD COPY PAPER SUBS 20 A4 PR OS-HCP20A4 0.00 155.00 310.00
REAM HARD COPY PAPER SUBS 20 SHORT OS-HCP20S 0.00 145.00 ZL. D0
PACK QUAFF PHOTO STICKER PAPER A4 9 L-QPSPA490-20 0.00 78.00 78.00
SUB-TOTAL >> 877.00
*** NOTHING FOLLOWS ***
GRAND TOTAL >> 877.00`, []);
  assert.equal(rows.length, 4);
  assert.deepEqual(Array.from(rows, row => row.unitPrice), ["340.00", "155.00", "145.00", "78.00"]);
  assert.equal(rows[0].description, "EPSON INK REFILL 65ML 003 T00V");
  assert.equal(rows[3].description, "QUAFF PHOTO STICKER PAPER A4 9");
  for (const row of rows) {
    assert.equal(row.quantity, "");
    assert.match(row.warning, /Quantity is missing/);
  }
  assert.match(rows[2].warning, /line total is unreadable/);
});

test("coded rows preserve explicit quantities and only exact active barcode matches", () => {
  const rows = parsePurchaseText("2 PCS Ink OS-INK20 0.00 1,200.50 2,401.00\n2 REAM Paper OS-PAPER20 10.00 155.00 300.00", [
    { ...products[0], sku: "OS-INK20" },
  ]);
  assert.equal(rows[0].quantity, "2");
  assert.equal(rows[0].description, "Ink");
  assert.equal(rows[0].productId, "1");
  assert.equal(rows[0].unitPrice, "1200.50");
  assert.equal(rows[0].warning, "");
  assert.match(rows[1].warning, /discount/);
});

test("damaged prices are not silently shifted or filled from invoice totals", () => {
  const rows = parsePurchaseText("PCS Ink OS-INK20 0.00 155.0¢ 310.00\nPCS Paper OS-PAPER20 0.00 ? 78.00", []);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.unitPrice, "");
    assert.equal(row.quantity, "");
    assert.match(row.warning, /Unit price is unreadable/);
  }
});

test("three-column product tables do not require totals, and discount tables do not use discounts as quantities", () => {
  const rows = parsePurchaseText("Description Qty Unit Price\nKeyboard 3 100.00\nMouse 2 50.00", products);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].productId, "1");
  assert.equal(rows[0].quantity, "3");
  assert.equal(rows[0].unitPrice, "100.00");
  const discounted = parsePurchaseText("Description Qty Disc Unit Price Total\nKeyboard 3 0.00 100.00 300.00", products);
  assert.equal(discounted[0].description, "Keyboard");
  assert.equal(discounted[0].quantity, "3");
  assert.equal(discounted[0].unitPrice, "100.00");
});

test("hyphenated product descriptions are not mistaken for invoice barcodes", () => {
  const rows = parsePurchaseText("Generic USB-C Cable 2 10.00 20.00\nGeneric USB-C 2 10.00 20.00", []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, "Generic USB-C Cable");
  assert.equal(rows[1].description, "Generic USB-C");
  assert.equal(rows[0].quantity, "2");
  assert.equal(rows[1].unitPrice, "10.00");
});
