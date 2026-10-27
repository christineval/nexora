import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { loadTs } from "./load-ts.mjs";

const { purchaseCreateSchema } = loadTs("src/validations/purchase-create.schema.ts");
const { validationMessages } = loadTs("src/lib/validation-errors.ts");
const { api } = loadTs("src/lib/api.ts", { "@/lib/rate-limit": { async limitRequest() {}, RateLimitError: class extends Error {} } });
const request = () => new Request("https://example.com/api/purchases/import", { method: "POST", headers: { Origin: "https://example.com" } });

test("purchase validation identifies supplier, date, line quantity, and individual new-product fields", async () => {
  const result = purchaseCreateSchema.safeParse({ partyId: "", date: "invalid", items: [{ newProduct: { name: "", unitCost: "bad", sellingPrice: "" }, quantity: 0 }] });
  assert.equal(result.success, false);
  const messages = validationMessages(result.error.issues);
  assert.equal(messages[0], "Select a supplier before saving.");
  for (const field of ["Product name", "Unit cost", "Selling price"]) assert.ok(messages.some(message => message.startsWith("Invoice line 1:") && message.includes(field)));
  assert.ok(messages.some(message => /Invoice line 1:.*greater than zero/.test(message)));
  assert.ok(messages.some(message => /purchase date/i.test(message)));
  assert.ok(messages.every(message => !message.includes("Select a valid record")));
  const response = await api(request(), async () => { throw result.error; });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.message, "Select a supplier before saving.");
  assert.ok(body.errors.some(message => message.includes("Invoice line 1: Selling price")));
});

test("invoice database failures explain the error category without exposing SQL, credentials or Prisma details", async () => {
  for (const [code, pattern, status] of [["P2028", /transaction time limit.*form/, 503], ["P2024", /database is busy/, 503], ["P2022", /schema is out of date/, 503], ["P2034", /Inventory changed.*form/, 409], ["P2003", /selected supplier, product, or user/, 409]]) {
    const error = new Prisma.PrismaClientKnownRequestError("PRIVATE SQL postgres://secret:password@host", { code, clientVersion: "5.22.0" });
    const response = await api(request(), async () => { throw error; });
    assert.equal(response.status, status);
    const body = await response.text();
    assert.match(body, pattern);
    assert.doesNotMatch(body, /PRIVATE|postgres:|password|Prisma|P20\d\d/);
  }
});
