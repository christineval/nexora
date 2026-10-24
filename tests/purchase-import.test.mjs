import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const { parsePurchaseText, matchImportProduct, matchImportLine } = loadTs("src/lib/purchase-import.ts");
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
    { ...products[0], supplierProductCode: "OS-INK20" },
  ]);
  assert.equal(rows[0].quantity, "2");
  assert.equal(rows[0].description, "Ink");
  assert.equal(rows[0].productId, "1");
  assert.equal(rows[0].supplierProductCode, "OS-INK20");
  assert.equal(rows[0].matchStatus, "code");
  assert.equal(rows[0].unitPrice, "1200.50");
  assert.equal(rows[0].warning, "");
  assert.match(rows[1].warning, /discount/);
});

test("supplier codes take priority over names and internal SKUs without erasing punctuation", () => {
  const catalog = [{ ...products[0], supplierProductCode: "BP-TBR-R" }, { ...products[1], supplierProductCode: "BPTBRR" }];
  assert.equal(matchImportLine("Mouse", "BP-TBR-R", catalog).productId, "1");
  assert.equal(matchImportLine("Unreadable", " BPTBRR ", catalog).productId, "2");
  assert.equal(matchImportLine("Unreadable", "bp-tbr-r", catalog).productId, "1");
  assert.equal(matchImportLine("Keyboard", "UNKNOWN", catalog).matchStatus, "suggested");
  assert.equal(matchImportLine("Unreadable", "P001", catalog).productId, "");
  assert.equal(matchImportLine("Keyboard", "BP-TBR-R", [...catalog, { ...catalog[0], productId: "3" }]).matchStatus, "ambiguous");
  assert.equal(matchImportLine("Unreadable", "BP-TBR-R", [{ ...catalog[0], status: "INACTIVE" }]).productId, "");
});

test("supplier-code typography matches automatically while punctuation and leading zeros remain distinct", () => {
  const catalog = [{ ...products[0], supplierProductCode: "BP-TBR-R" }, { ...products[1], supplierProductCode: "00123" }];
  assert.equal(matchImportLine("Unreadable", " bp \u2013 TBR - r ", catalog).matchStatus, "code");
  assert.equal(matchImportLine("Unreadable", "123", catalog).productId, "");
  assert.equal(matchImportLine("Unreadable", "BPTBRR", catalog).productId, "");
  assert.equal(matchImportLine("Unreadable", "bp-tbr-r", [...catalog, { ...catalog[0], productId: "3", supplierProductCode: "bp-tbr-r" }]).matchStatus, "ambiguous");
});

test("the saved BP-TRB-R versus invoice BP-TBR-R mismatch suggests the existing prefixed-name product instead of creating a new one", () => {
  const catalog = [{ ...products[0], name: "BALL RETAINER REAR PRX", supplierProductCode: "BP-TRB-R" }];
  const line = parsePurchaseText("QTY DESCRIPTIONS BARCODE DISC UNIT PRICE TOTAL\n100 PCS BP, BALL RETAINER REAR PRX BP-TBR-R 0.00 3.00 300.00", catalog)[0];
  assert.equal(line.productId, "1");
  assert.equal(line.matchStatus, "suggested");
  assert.equal(line.warning, "");
  const correctedCatalog = [{ ...catalog[0], supplierProductCode: "BP-TBR-R" }];
  assert.equal(matchImportLine(line.description, line.supplierProductCode, correctedCatalog).matchStatus, "code");
  assert.equal(catalog[0].supplierProductCode, "BP-TRB-R");
});

test("unique exact names auto-match without conflicting codes; similar names and duplicate candidates require review", () => {
  assert.equal(matchImportLine("Keyboard", "", products).matchStatus, "name");
  assert.equal(matchImportLine("Keyboard", "NEW-CODE", products).productId, "1");
  const catalog = [{ ...products[0], name: "SPORTS BALL VALVE SMALL", supplierProductCode: "SPORTS-1" }];
  assert.equal(matchImportLine("SPORTS BALL VALVE", "", catalog).matchStatus, "suggested");
  assert.equal(matchImportLine("SPORTS BALL VALVE", "", [...catalog, { ...catalog[0], productId: "3" }]).matchStatus, "ambiguous");
  assert.equal(matchImportLine("Keyboard", "", [...products, { ...products[0], productId: "3" }]).matchStatus, "ambiguous");
  assert.equal(matchImportLine("", "", products).matchStatus, "unmatched");
});

test("barcode headers accept plain, numeric and punctuation-bearing supplier codes", () => {
  const rows = parsePurchaseText("QTY DESCRIPTIONS BARCODE DISC. UNIT PRICE TOTAL\n2 PCS Widget 001234 0.00 3.00 6.00\n1 PCS Other AB_cd/12.3 0.00 4.00 4.00", []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].supplierProductCode, "001234");
  assert.equal(rows[1].supplierProductCode, "AB_cd/12.3");
  assert.equal(rows[0].description, "Widget");
  assert.equal(parsePurchaseText("Barcode Scanner 2 3.00 6.00", [])[0].description, "Barcode Scanner");
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

test("full invoice rows separate numeric quantities and ignore units without stripping product sizes", () => {
  const rows = parsePurchaseText(`QTY DESCRIPTIONS BARCODE DISC. UNIT PRICE TOTAL
100 PCS BP, BALL RETAINER REAR PRX BP-TBR-R 0.00 3.00 300.00
(30) PCS BP, BMX CABLE REAR PE- BP-TBC-R 0.00 15.00 450.00
12/PCS BP, FRONT AXLE A CR- BP-TFA-A 0.00 32.00 384.00
2) PCS BP, MTB V-BRAKE ALLOY PGB- BP-TMVB-A 0.00 240.00 480.00
2 PCS BP, MTB V-BRAKE STEEL PCX- BP-TMVB-S 0.00 150.00 300.00
3 PCS BP, PEDAL PLASTIC 1/2 RT- BP-CPP1/2 0.00 65.00 195.00
12 PCS BP, REAR AXLE WNR PIBX BP-TRA-WNR 0.00 28.00 336.00
10 PAIR BP, STAR HANDLE GRIP BLACK UT- BP-SHG-BK 0.00 40.00 400.00
5 PCS BP, TIRE LEO 26 X 1 3/8 DIABLO BP-LT26X13/8D 0.00 151.00 755.00
(10) PCS BP, TUBE LEO 14 X 2.125 BUTYL BP-LTU14X2.125B 0.00 54.00 540.00
3 PCS MO, PRESTONE BRAKE FLUID SMALL MO-PRBFS 0.00 66.00 198.00
SUB-TOTAL >> 4,338.00`, []);
  assert.equal(rows.length, 11);
  assert.deepEqual(Array.from(rows, row => row.quantity), ["100", "30", "12", "2", "2", "3", "12", "10", "5", "10", "3"]);
  assert.deepEqual(Array.from(rows, row => row.unitPrice), ["3.00", "15.00", "32.00", "240.00", "150.00", "65.00", "28.00", "40.00", "151.00", "54.00", "66.00"]);
  for (const row of rows) {
    assert.doesNotMatch(row.description, /^(?:\d|PCS\b|PAIR\b)/i);
    assert.equal(row.warning, "Select the matching product.");
  }
  assert.equal(rows[5].description, "BP, PEDAL PLASTIC 1/2 RT-");
  assert.equal(rows[8].description, "BP, TIRE LEO 26 X 1 3/8 DIABLO");
  assert.equal(rows[9].description, "BP, TUBE LEO 14 X 2.125 BUTYL");
});

test("an unreadable quantity remains blank while unit text is excluded from descriptions", () => {
  const rows = parsePurchaseText("? PCS Inner tube BP-TUBE-1 0.00 54.00 540.00\n? Inner tube BP-TUBE-2 0.00 54.00 540.00", []);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.quantity, "");
    assert.equal(row.description, "Inner tube");
    assert.equal(row.unitPrice, "54.00");
    assert.match(row.warning, /Quantity is missing/);
  }
});
