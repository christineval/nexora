import assert from "node:assert/strict";
import { test } from "node:test";
import { filterProducts, paginateProducts } from "../src/lib/product-list.ts";

const rows = [
  { productId: "1", sku: "P001", name: "Basketball", size: "Size 7", stockQty: 25, unitCost: 450, sellingPrice: 890, status: "ACTIVE" },
  { productId: "2", sku: "P002", name: "Yoga mat", size: null, stockQty: 10, unitCost: 200, sellingPrice: 450, status: "ACTIVE" },
  { productId: "3", sku: "P003", name: "Water bottle", size: "1L", stockQty: 0, unitCost: 150, sellingPrice: 350, status: "OTHER" },
  { productId: "4", sku: "P004", name: "Dumbbell", size: "5kg", stockQty: 1, unitCost: 350, sellingPrice: 700, status: "ACTIVE" },
];
const defaults = { query: "", status: "", stock: "all" };

test("searches names, SKUs, and sizes without case or whitespace sensitivity", () => {
  assert.deepEqual(filterProducts(rows, { ...defaults, query: " BASKET " }).map((row) => row.productId), ["1"]);
  assert.deepEqual(filterProducts(rows, { ...defaults, query: "p002" }).map((row) => row.productId), ["2"]);
  assert.deepEqual(filterProducts(rows, { ...defaults, query: "1l" }).map((row) => row.productId), ["3"]);
  assert.equal(filterProducts(rows, { ...defaults, query: "missing" }).length, 0);
});

test("combines search, the exact recorded status, and stock filters", () => {
  assert.deepEqual(filterProducts(rows, { query: "Water", status: "OTHER", stock: "out-of-stock" }).map((row) => row.productId), ["3"]);
  assert.equal(filterProducts(rows, { query: "Water", status: "ACTIVE", stock: "all" }).length, 0);
});

test("stock filters cover the established zero and ten-unit boundaries", () => {
  assert.deepEqual(filterProducts(rows, { ...defaults, stock: "in-stock" }).map((row) => row.stockQty), [25]);
  assert.deepEqual(filterProducts(rows, { ...defaults, stock: "low-stock" }).map((row) => row.stockQty), [10, 1]);
  assert.deepEqual(filterProducts(rows, { ...defaults, stock: "out-of-stock" }).map((row) => row.stockQty), [0]);
});

test("pagination clamps the current page after filtering and handles empty data", () => {
  const page = paginateProducts(rows, 2, 3);
  assert.equal(page.start, 4);
  assert.equal(page.end, 4);
  assert.deepEqual(page.rows.map((row) => row.productId), ["4"]);
  assert.equal(paginateProducts(rows.slice(0, 1), 8).page, 1);
  assert.equal(paginateProducts(rows, 0).page, 1);
  assert.deepEqual(paginateProducts([], 3), { rows: [], page: 1, pageCount: 1, start: 0, end: 0, total: 0 });
});

test("filtering and pagination preserve authoritative product data", () => {
  const original = structuredClone(rows);
  paginateProducts(filterProducts(rows, { ...defaults, query: "p" }), 2, 2);
  assert.deepEqual(rows, original);
});
