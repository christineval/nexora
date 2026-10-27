import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const { customerSchema } = loadTs("src/validations/customer.schema.ts");
const { supplierSchema } = loadTs("src/validations/supplier.schema.ts");
const input = { name: "Customer", email: "", phone: "09123456789", address: "", status: "ACTIVE" };

test("customer contact numbers preserve leading zeros, remain optional, and reject non-digits", () => {
  assert.equal(customerSchema.parse(input).phone, "09123456789");
  assert.equal(customerSchema.parse({ ...input, phone: "" }).phone, "");
  assert.equal(customerSchema.safeParse({ ...input, phone: "1".repeat(30) }).success, true);
  for (const phone of ["abc", "0912abc", "+639123456789", "0912-345-6789", "0912 345 6789", "1.5", "1e3", "1".repeat(31), 9123456789]) {
    assert.equal(customerSchema.safeParse({ ...input, phone }).success, false);
  }
  assert.equal(supplierSchema.safeParse({ ...input, phone: "+63 912-345-6789", contactPerson: "" }).success, true);
});

test("customer create and edit reject invalid contact numbers before writes and save digits as strings", async () => {
  const writes = [];
  const customers = {
    async findMany() { return []; },
    async findUnique() { return { id: 1n, ...input }; },
    async create({ data }) { writes.push(data); return { id: 1n }; },
    async update({ data }) { writes.push(data); return { id: 1n }; },
  };
  const { saveContact } = loadTs("src/services/contact.service.ts", { "@/server/audit": { async recordAudit() {} }, "@/lib/prisma": { prisma: { async $transaction(operation) { return operation({ customers }); } } } });
  for (const recordId of [undefined, "1"]) {
    await assert.rejects(saveContact("customers", { ...input, phone: "0912abc" }, 1n, recordId), /digits only/);
    assert.equal(writes.length, recordId ? 1 : 0);
    await saveContact("customers", input, 1n, recordId);
    assert.equal(writes.at(-1).phone, "09123456789");
  }
  await saveContact("customers", { ...input, phone: "" }, 1n);
  assert.equal(writes.at(-1).phone, null);
});
