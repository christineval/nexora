import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { filterInventoryMovements, movementDateKey, movementReference, paginateInventoryMovements } from "../src/lib/inventory-movements.ts";

const defaults = { query: "", type: "", productId: "", from: "", to: "" };
const rows = [
  { id: "3", timestamp: "2026-10-09T16:00:00Z", productId: "1", productName: "Basketball", productSku: "ERP-0020", type: "SALE", quantity: -5, referenceType: "ORDER", referenceId: "1005", createdBy: "Admin User" },
  { id: "2", timestamp: "2026-10-09T15:59:59Z", productId: "2", productName: "Basketball", productSku: "ERP-0019", type: "PURCHASE", quantity: 20, referenceType: "PURCHASE_ORDER", referenceId: "1", createdBy: "Inventory User" },
  { id: "1", timestamp: "2026-10-08T15:59:59Z", productId: "2", productName: "Basketball", productSku: "ERP-0019", type: "ADJUSTMENT_IN", quantity: 2, referenceType: null, referenceId: null, createdBy: "Inventory User" },
];

test("date range includes both boundary dates in Philippine time", () => {
  assert.equal(movementDateKey(rows[0].timestamp), "2026-10-10");
  assert.equal(movementDateKey(rows[1].timestamp), "2026-10-09");
  assert.deepEqual(filterInventoryMovements(rows, { ...defaults, from: "2026-10-09", to: "2026-10-09" }).map((row) => row.id), ["2"]);
  assert.deepEqual(filterInventoryMovements(rows, { ...defaults, from: "2026-10-09" }).map((row) => row.id), ["3", "2"]);
  assert.deepEqual(filterInventoryMovements(rows, { ...defaults, to: "2026-10-09" }).map((row) => row.id), ["2", "1"]);
  assert.deepEqual(filterInventoryMovements(rows, { ...defaults, from: "2026-10-10", to: "2026-10-09" }), []);
});

test("search combines with exact type and product ID filters", () => {
  assert.deepEqual(filterInventoryMovements(rows, { ...defaults, query: " erp-0019 ", type: "PURCHASE", productId: "2" }).map((row) => row.id), ["2"]);
  assert.deepEqual(filterInventoryMovements(rows, { ...defaults, productId: "1" }).map((row) => row.id), ["3"]);
  assert.deepEqual(filterInventoryMovements(rows, { ...defaults, query: "#1005" }).map((row) => row.id), ["3"]);
  assert.equal(filterInventoryMovements(rows, { ...defaults, query: "inventory user" }).length, 2);
  assert.equal(filterInventoryMovements(rows, { ...defaults, type: "UNKNOWN" }).length, 0);
  assert.equal(movementReference(rows[2]), "—");
});

test("pagination clamps after filtering without changing audit quantities or row order", () => {
  const before = structuredClone(rows);
  const page = paginateInventoryMovements(rows, 2, 2);
  assert.deepEqual(page.rows.map((row) => row.id), ["1"]);
  assert.equal(page.start, 3);
  assert.equal(page.end, 3);
  assert.equal(paginateInventoryMovements(rows.slice(0, 1), 5).page, 1);
  assert.equal(paginateInventoryMovements([], 5).start, 0);
  assert.equal(paginateInventoryMovements([], 5).pageCount, 1);
  assert.deepEqual(rows, before);
});

const loadPackage = createRequire(import.meta.url);
function loadModule(path) {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name.startsWith("@/")) { const base = "src/" + name.slice(2); return loadModule(base + (existsSync(base + ".ts") ? ".ts" : ".tsx")); }
      return loadPackage(name);
    },
  });
  return exports;
}
const { default: MovementTable } = loadModule("src/components/inventory/MovementTable.tsx");

test("movement view renders labeled calendar controls, signed quantities, and pagination", () => {
  const html = renderToStaticMarkup(createElement(MovementTable, { rows }));
  assert.match(html, /for="movement-from"/);
  assert.match(html, /id="movement-from" type="date"/);
  assert.match(html, /for="movement-to"/);
  assert.match(html, /id="movement-to" type="date"/);
  assert.match(html, /Filter by date range: All dates/);
  assert.match(html, /Inventory movement pagination/);
  assert.match(html, />-5<\/span>/);
  assert.match(html, />\+20<\/span>/);
  assert.match(html, /Showing 1 to 3 of 3 movements/);
  assert.match(html, /<option value="1">Basketball \(ERP-0020\)<\/option>/);
});

test("empty movement view contains no invented records", () => {
  const html = renderToStaticMarkup(createElement(MovementTable, { rows: [] }));
  assert.match(html, /No inventory movements yet/);
  assert.match(html, /Showing 0 to 0 of 0 movements/);
  assert.doesNotMatch(html, /Basketball|Admin User/);
});
