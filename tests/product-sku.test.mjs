import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/inventory.service.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

function loadService(skus) {
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === "server-only" || name === "@/server/audit") return {};
      if (name === "@/lib/not-implemented") return {};
      if (name === "@/validations/product.schema" || name === "@/validations/shared") return {};
      if (name === "@/lib/prisma") return {
        prisma: { products: { async findMany(query) {
          assert.equal(query.where.sku.startsWith, "ERP-");
          assert.equal(query.select.sku, true);
          return skus.map((sku) => ({ sku }));
        } } },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}

test("next SKU increments the highest database SKU and preserves the hyphen", async () => {
  const service = loadService(["ERP-0020", "ERP-0009", "ERP-0019", "ERP-invalid"]);
  assert.equal(await service.getNextProductSku(), "ERP-0021");
});

test("next SKU starts at ERP-0001 when no matching products exist", async () => {
  assert.equal(await loadService([]).getNextProductSku(), "ERP-0001");
});

test("next SKU compares numbers rather than lexical order", async () => {
  assert.equal(await loadService(["ERP-9999", "ERP-10000"]).getNextProductSku(), "ERP-10001");
});
