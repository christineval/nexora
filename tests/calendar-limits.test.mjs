import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

const { philippineDate } = loadTs("src/lib/feature-list.ts");
const { transactionSchema } = loadTs("src/validations/shared.ts");
const { orderSchema } = loadTs("src/validations/order.schema.ts");
const { purchaseCreateSchema, purchaseInvoiceSchema } = loadTs("src/validations/purchase-create.schema.ts");
const { purchasePaymentSchema } = loadTs("src/validations/purchase-payment.schema.ts");
const { auditFilterSchema } = loadTs("src/validations/audit.schema.ts");

test("every saved-date boundary and audit filter accepts today but rejects tomorrow in Manila", () => {
  const today = philippineDate(new Date().toISOString());
  const tomorrow = new Date(new Date(today + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const order = { partyId: "1", items: [{ productId: "1", quantity: 1, unitPrice: "1.00" }] };
  for (const [schema, fields] of [
    [transactionSchema, order], [orderSchema, order], [purchaseCreateSchema, order],
    [purchaseInvoiceSchema, { ...order, importKey: "281deca6-cb7d-4ed5-ae13-f43cc7765672" }],
    [purchasePaymentSchema, { paymentKey: "281deca6-cb7d-4ed5-ae13-f43cc7765672", amount: "1.00" }],
  ]) {
    assert.equal(schema.safeParse({ ...fields, date: today }).success, true);
    assert.equal(schema.safeParse({ ...fields, date: "2000-01-01" }).success, true);
    assert.equal(schema.safeParse({ ...fields, date: tomorrow }).success, false);
  }
  for (const key of ["from", "to"]) {
    assert.equal(auditFilterSchema.safeParse({ [key]: today }).success, true);
    assert.equal(auditFilterSchema.safeParse({ [key]: tomorrow }).success, false);
  }
  assert.equal(philippineDate("2026-10-26T15:59:59Z"), "2026-10-26");
  assert.equal(philippineDate("2026-10-26T16:00:00Z"), "2026-10-27");
});

test("future purchase creation and pending edits fail before opening any database transaction", async () => {
  const service = loadTs("src/services/transaction.service.ts", { "@/lib/prisma": { prisma: { async $transaction() { assert.fail("Future dates must be rejected before database writes."); } } } });
  const actor = { id: 1n, name: "Administrator", role: "ADMIN" };
  const data = { partyId: "1", date: "2999-01-01", items: [{ productId: "1", quantity: 1, unitPrice: "1.00" }] };
  await assert.rejects(service.createTransaction("purchasing", data, actor), /future/);
  await assert.rejects(service.editTransaction("purchasing", "1", data, actor), /future/);
});

test("sales, purchase, invoice and payment date controls render a maximum of today", () => {
  const today = philippineDate(new Date().toISOString());
  const mocks = {
    "@/components/ui/GuestPreviewProvider": { useGuestPreview: () => false },
    "@/components/ui/SnackbarProvider": { useNotifications: () => ({ notify() {} }) },
    "@/components/ui/use-mutation": () => ({ saving: false, clearError() {}, submit() {} }),
    "@/lib/receipt-ocr": { maxReceiptSize: 20000000, receiptTypes: [], readReceipt() {} },
  };
  const TransactionForm = loadTs("src/components/features/TransactionForm.tsx", mocks).default;
  const Import = loadTs("src/components/features/PurchaseImport.tsx", mocks).default;
  const Payment = loadTs("src/components/features/PurchasePaymentForm.tsx", mocks).default;
  const row = { id: "1", party: "Supplier", partyId: "1", timestamp: "2026-01-01T00:00:00Z", status: "RECEIVED", total: "1.00", items: [], createdBy: "Admin", payments: [] };
  const html = [
    ...["sales", "purchasing"].map(kind => renderToStaticMarkup(createElement(TransactionForm, { kind, parties: [], products: [], saving: false, onSubmit() {} }))),
    renderToStaticMarkup(createElement(Import, { parties: [], products: [] })),
    renderToStaticMarkup(createElement(Payment, { row, canEdit: true, saving: false, onSave() {} })),
  ];
  for (const output of html) {
    const dates = [...output.matchAll(/<input\b[^>]*type="date"[^>]*>/g)];
    assert.ok(dates.length > 0);
    for (const [input] of dates) assert.ok(input.includes(`max="${today}"`), input);
  }
});

test("audit calendars are capped at today and future query dates do not reach the audit service", async () => {
  let reads = 0;
  const Page = loadTs("src/app/(erp)/settings/audit/page.tsx", {
    "@/lib/auth": { async requirePageAccess() { return { id: 1n, name: "Admin", role: "ADMIN" }; } },
    "@/services/audit.service": { async listAuditLogs() { reads++; return { rows: [], total: 0, page: 1, pages: 1 }; } },
    "next/link": { __esModule: true, default: ({ href, children }) => createElement("a", { href }, children) },
  }).default;
  const today = philippineDate(new Date().toISOString());
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  const dates = [...html.matchAll(/<input\b[^>]*type="date"[^>]*>/g)];
  assert.equal(dates.length, 2);
  for (const [input] of dates) assert.ok(input.includes(`max="${today}"`));
  assert.equal(reads, 1);
  const invalid = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ from: "2999-01-01" }) }));
  assert.match(invalid, /cannot be in the future/);
  assert.equal(reads, 1);
});
