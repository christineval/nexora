import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const { receiptBarcodeIndex, receiptQuantityColumns, receiptRowBaseline, receiptOriginalQuantity } = loadTs("src/lib/receipt-table.ts");
function word(text, x0, y0, x1, y1, confidence = 95) { return { text, bbox: { x0, y0, x1, y1 }, confidence }; }
const words = [word("(10)", 10, 100, 40, 125), word("PCS", 60, 100, 100, 120), word("MTB", 120, 98, 160, 118), word("V-BRAKE", 180, 95, 250, 115), word("BP-CPP1/2", 350, 90, 450, 110), word("0.00", 480, 90, 520, 110), word("65.00", 550, 90, 600, 110), word("650.00", 650, 90, 720, 110)];

test("table geometry anchors on invoice codes, including fractions and decimal sizes, rather than hyphenated names", () => {
  assert.equal(receiptBarcodeIndex(words), 4);
  const decimal = [...words]; decimal[4] = { ...words[4], text: "BP-LTU14X2.125B" };
  assert.equal(receiptBarcodeIndex(decimal), 4);
  const baseline = receiptRowBaseline(words, 110, 4);
  assert.ok(baseline);
  assert.ok(baseline.slope < 0);
  assert.ok(Math.abs((baseline.intercept + baseline.slope * 140) - 118) < 1);
});

test("quantity columns require a header and use units even when OCR assigns them to a separate line", () => {
  const lines = [{ text: "QTY DESCRIPTION BARCODE DISC UNIT PRICE TOTAL", words: [] }, { text: "PCS", words: [words[1]] }, { text: "Product row", words: words.filter((_, index) => index !== 1) }];
  const columns = receiptQuantityColumns(lines);
  assert.equal(columns.quantityRight, 52);
  assert.equal(columns.descriptionLeft, 115);
  assert.equal(receiptQuantityColumns(lines.slice(1)), null);
  assert.equal(receiptQuantityColumns([{ ...lines[0] }, { text: "row", words: words.map(w => w.text === "PCS" ? { ...w, bbox: { ...w.bbox, x0: 0 } } : w) }]), null);
});

test("quantity fallback accepts only clearly read numeric prefixes and never uses a product size or line total", () => {
  assert.equal(receiptOriginalQuantity(words, 4), "10");
  assert.equal(receiptOriginalQuantity(words.map((w, index) => index === 0 ? { ...w, confidence: 20 } : w), 4), "");
  assert.equal(receiptOriginalQuantity(words.slice(1), 3), "");
  assert.equal(receiptOriginalQuantity(words.map((w, index) => index === 0 ? { ...w, text: "(1O)" } : w), 4), "");
});
