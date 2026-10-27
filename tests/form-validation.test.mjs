import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const { createProductSchema, createProductRequestSchema, updateProductSchema } = loadTs("src/validations/product.schema.ts");
const { purchaseCreateSchema } = loadTs("src/validations/purchase-create.schema.ts");
const { productsDuplicate, contactIdentity } = loadTs("src/lib/record-identity.ts");
const duplicates = loadTs("src/server/record-duplicates.ts");
const product = { name: "Notebook", size: "Small", unitCost: "10.00", sellingPrice: "13.00" };

test("all product entry schemas reject below-cost prices with decimal-safe comparisons", () => {
  for (const schema of [createProductSchema, createProductRequestSchema, updateProductSchema]) {
    for (const [unitCost, sellingPrice, valid] of [["0.10", "0.09", false], ["10.01", "10.00", false], ["10.00", "10.00", true], ["9999999999.99", "9999999999.98", false], ["0", "0", true], ["invalid", "1", false]]) {
      const parsed = schema.safeParse({ ...product, status: "ACTIVE", unitCost, sellingPrice });
      assert.equal(parsed.success, valid);
      if (!valid && unitCost !== "invalid") assert.ok(parsed.error.issues.some(issue => issue.path[0] === "sellingPrice" && /lower than unit cost/.test(issue.message)));
    }
  }
  const invoice = purchaseCreateSchema.safeParse({ partyId: "1", date: "2026-10-25", items: [{ newProduct: { ...product, sellingPrice: "9.99" }, quantity: 1 }] });
  assert.equal(invoice.success, false);
  assert.ok(invoice.error.issues.some(issue => issue.path.join(".") === "items.0.newProduct.sellingPrice"));
});

test("matching product names require distinct non-empty sizes; contact names alone identify duplicates", () => {
  for (const [first, second, duplicate] of [[undefined, undefined, true], ["Small", "small", true], [" Small ", "  SMALL  ", true], ["Small", "Large", false], ["", "Large", true], ["Small", null, true]]) {
    assert.equal(productsDuplicate({ name: "  Note   book ", size: first }, { name: "note book", size: second }), duplicate);
  }
  assert.equal(productsDuplicate({ name: "Notebook" }, { name: "Pen" }), false);
  assert.equal(contactIdentity({ name: " Jane   Doe " }), contactIdentity({ name: "jane doe", email: "different@example.com" }));
});

test("invoice validation flags normalized duplicate new products while allowing sized variants", () => {
  const input = { partyId: "1", date: "2026-10-25", items: [{ newProduct: product, quantity: 1 }, { newProduct: { ...product, name: "  NOTEBOOK  ", size: "" }, quantity: 2 }] };
  const invalid = purchaseCreateSchema.safeParse(input);
  assert.equal(invalid.success, false);
  assert.ok(invalid.error.issues.some(issue => issue.path.join(".") === "items.1.newProduct.name"));
  input.items[1].newProduct.size = "Large";
  assert.equal(purchaseCreateSchema.safeParse(input).success, true);
});

test("server duplicate checks include archived products and exclude only the edited record", async () => {
  const rows = [{ id: 1n, name: "NOTEBOOK", size: "Small", status: "INACTIVE" }];
  const tx = { products: { async findMany(query) {
    assert.equal(query.where.status, undefined);
    assert.equal(query.where.OR[0].name.mode, "insensitive");
    return rows.filter(row => row.id !== query.where.id?.not);
  } } };
  await assert.rejects(duplicates.assertNoDuplicateProducts(tx, [product]), error => error.status === 409);
  await duplicates.assertNoDuplicateProducts(tx, [{ ...product, size: "Large" }]);
  await assert.rejects(duplicates.assertNoDuplicateProducts(tx, [{ ...product, size: "" }]), /non-empty sizes/);
  await duplicates.assertNoDuplicateProducts(tx, [product], 1n);
  await assert.rejects(duplicates.assertNoDuplicateProducts(tx, [product, { ...product, size: "" }]), /Repeated product name/);
});

test("standalone product creation rejects duplicates before SKU, stock, product or audit writes", async () => {
  const { createProduct } = loadTs("src/services/inventory.service.ts", {
    "@/lib/prisma": { prisma: { async $transaction(operation, options) {
      assert.equal(options.isolationLevel, "Serializable");
      return operation({ products: { async findMany() { return [{ id: 1n, name: "NOTEBOOK", size: "Small" }]; }, create() { assert.fail("Duplicate product write"); } }, $queryRaw() { assert.fail("Duplicate SKU allocation"); } });
    } } },
  });
  await assert.rejects(createProduct({ ...product, quantity: 4 }, 2n), /already exists/);
});

test("customer and supplier saves reject duplicate names despite changed emails and permit editing the same record", async () => {
  for (const kind of ["customers", "suppliers"]) {
    let writes = 0;
    const data = { name: "Jane Doe", email: "new@example.com", phone: "0912345", address: "", status: "ACTIVE", contactPerson: "Contact" };
    const model = {
      async findMany(query) { return query.where.id?.not === 1n ? [] : [{ id: 1n, name: "  JANE   DOE ", email: "old@example.com", phone: "0000" }]; },
      async findUnique() { return { id: 1n, ...data }; },
      async create() { writes++; return { id: 2n }; },
      async update() { writes++; return { id: 1n }; },
    };
    const { saveContact } = loadTs("src/services/contact.service.ts", {
      "@/server/audit": { async recordAudit() {} },
      "@/lib/prisma": { prisma: { async $transaction(operation, options) { assert.equal(options.isolationLevel, "Serializable"); return operation({ [kind]: model }); } } },
    });
    await assert.rejects(saveContact(kind, data, 3n), /name already exists/);
    await assert.rejects(saveContact(kind, data, 3n, "2"), /name already exists/);
    assert.equal(writes, 0);
    await saveContact(kind, data, 3n, "1");
    assert.equal(writes, 1);
  }
});

test("user email checks are case insensitive, reject another account and permit unchanged email", async () => {
  const tx = { users: { async findFirst({ where }) {
    assert.equal(where.email.mode, "insensitive");
    assert.equal(where.email.equals, "Admin@example.com");
    return where.id?.not === 1n ? null : { id: 1n };
  } } };
  await assert.rejects(duplicates.assertNoDuplicateUserEmail(tx, " Admin@example.com "), /email already exists/);
  await assert.rejects(duplicates.assertNoDuplicateUserEmail(tx, "Admin@example.com", 2n), /email already exists/);
  await duplicates.assertNoDuplicateUserEmail(tx, "Admin@example.com", 1n);
});

test("shared password schemas validate matching confirmations and UTF-8 byte limits in browsers and on the server", () => {
  const { userSchema, passwordChangeSchema } = loadTs("src/validations/user.schema.ts");
  assert.equal(userSchema.shape.password.safeParse("a".repeat(12)).success, true);
  assert.equal(userSchema.shape.password.safeParse("é".repeat(37)).success, false);
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: "old", password: "a".repeat(12), confirmPassword: "b".repeat(12) }).success, false);
});

test("barcodes match OCR normalization independently of name and size, preserving zeros and punctuation", () => {
  const { productBarcodesDuplicate } = loadTs("src/lib/record-identity.ts");
  for (const [first, second, expected] of [["001-ab/2", " 001 – AB / 2 ", true], ["００１－ＡＢ", "001-AB", true], ["001", "1", false], ["AB-1", "AB1", false], ["", "", false], [null, "  ", false]]) {
    assert.equal(productBarcodesDuplicate({ supplierProductCode: first }, { supplierProductCode: second }), expected);
  }
  const invoice = { partyId: "1", date: "2026-10-25", items: [{ newProduct: { ...product, supplierProductCode: "001-ab" }, quantity: 1 }, { newProduct: { ...product, name: "Different product", size: "Large", supplierProductCode: "001 – AB" }, quantity: 1 }] };
  const parsed = purchaseCreateSchema.safeParse(invoice);
  assert.equal(parsed.success, false);
  assert.ok(parsed.error.issues.some(issue => issue.path.join(".") === "items.1.newProduct.supplierProductCode" && /Repeated barcode/.test(issue.message)));
});

test("server barcode checks include differently named and archived products and allow retaining one's own barcode", async () => {
  const tx = { products: { async findMany({ where, select }) {
    assert.ok(where.OR.some(predicate => predicate.supplier_product_code?.not === null));
    assert.equal(select.supplier_product_code, true);
    return where.id?.not === 1n ? [] : [{ id: 1n, name: "Archived item", size: "Small", supplier_product_code: "001 – AB" }];
  } } };
  const input = { ...product, name: "Different item", size: "Large", supplierProductCode: "001-ab" };
  await assert.rejects(duplicates.assertNoDuplicateProducts(tx, [input]), error => error.status === 409 && /barcode already exists/.test(error.message));
  await duplicates.assertNoDuplicateProducts(tx, [input], 1n);
  await assert.rejects(duplicates.assertNoDuplicateProducts(tx, [input, { ...input, name: "Third item" }]), /Repeated barcode/);
});

test("product edits cannot claim another barcode but may retain their own code", async () => {
  const records = [{ id: 1n, name: "Other", size: "Small", supplier_product_code: "001-AB" }, { id: 2n, name: "Notebook", size: "Small", supplier_product_code: "OWN-002", status: "ACTIVE" }];
  let writes = 0;
  const { updateProduct } = loadTs("src/services/inventory.service.ts", {
    "@/server/audit": { async recordAudit() {} },
    "@/lib/prisma": { prisma: { async $transaction(operation, options) {
      assert.equal(options.isolationLevel, "Serializable");
      return operation({ products: {
        async findUnique() { return records[1]; },
        async findMany({ where }) { return records.filter(record => record.id !== where.id?.not); },
        async update() { writes++; return records[1]; },
      } });
    } } },
  });
  await assert.rejects(updateProduct("2", { ...product, status: "ACTIVE", supplierProductCode: "001-ab" }, 3n), /barcode already exists/);
  assert.equal(writes, 0);
  await updateProduct("2", { ...product, status: "ACTIVE", supplierProductCode: "OWN-002" }, 3n);
  assert.equal(writes, 1);
});
