import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

test("product edits persist and clear arbitrary supplier codes, preserve SKU and stock, and record code changes in audit history", async () => {
  let row = { id: 1n, sku: "ERP-0001", supplier_product_code: null, stock_qty: 7 };
  const audits = [];
  const tx = {
    products: {
      async findUnique() { return { ...row }; },
      async update({ data }) {
        assert.equal(data.sku, undefined);
        assert.equal(data.stock_qty, undefined);
        row = { ...row, ...data };
        return row;
      },
    },
    users: { async findUnique() { return { id: 1n, name: "Admin", role: "ADMIN" }; } },
    audit_logs: { async create({ data }) { audits.push(data); } },
  };
  const { updateProduct } = loadTs("src/services/inventory.service.ts", { "@/lib/prisma": { prisma: { $transaction: operation => operation(tx) } } });
  const input = { name: "Retainer", unitCost: "3.00", sellingPrice: "5.00", status: "ACTIVE" };
  await updateProduct("1", { ...input, supplierProductCode: "  001_AB/12.3-x  ", sku: "TAMPERED", stock_qty: 99, quantity: 99 }, 1n);
  assert.equal(row.supplier_product_code, "001_AB/12.3-x");
  assert.equal(row.sku, "ERP-0001");
  assert.equal(row.stock_qty, 7);
  assert.equal(audits[0].after.supplier_product_code, "001_AB/12.3-x");
  await updateProduct("1", { ...input, supplierProductCode: "" }, 1n);
  assert.equal(row.supplier_product_code, null);
  assert.equal(audits[1].before.supplier_product_code, "001_AB/12.3-x");
  assert.equal(audits[1].after.supplier_product_code, null);
});
