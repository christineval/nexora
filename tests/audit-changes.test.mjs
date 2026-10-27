import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

const { getAuditChanges, auditValueText } = loadTs("src/lib/audit-changes.ts");
const AuditChanges = loadTs("src/components/features/AuditChanges.tsx").default;
const plain = value => JSON.parse(JSON.stringify(value));

test("audit changes show changed fields only with readable labels and exact monetary values", () => {
  const changes = plain(getAuditChanges(
    { name: "Keyboard", stock_qty: 10, status: "PENDING", selling_price: "100.00" },
    { name: "Keyboard", stock_qty: 8, status: "COMPLETED", selling_price: "120.50" },
  ));
  assert.deepEqual(changes.map(row => row.label), ["Stock quantity", "Status", "Selling price"]);
  assert.equal(changes[0].before, "10");
  assert.equal(changes[0].after, "8");
  assert.equal(changes[1].after, "Completed");
  assert.match(changes[2].after, /₱120\.50/);
  assert.match(auditValueText("inventory_value", "21474836469978525163.53"), /21,474,836,469,978,525,163\.53/);
  assert.equal(auditValueText("product_id", "9223372036854775807"), "#9223372036854775807");
});

test("audit product lines match by product identity and do not fabricate changes from reordering", () => {
  const item = (product_id, quantity) => ({ product_id, quantity, unit_price: "10.00" });
  const changes = getAuditChanges({ order_items: [item("1", 2), item("2", 1)] }, { order_items: [item("2", 1), item("1", 3)] });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].label, "Sales items · Product #1 · Quantity");
  assert.equal(changes[0].before, "2");
  assert.equal(changes[0].after, "3");
});

test("audit creation, removal, dates and private-field notices have clear non-code descriptions", () => {
  const created = getAuditChanges(null, { name: "Product", status: "ACTIVE", changed_fields: ["email", "phone"] });
  assert.ok(created.every(row => row.kind === "added" && row.before === "Not recorded"));
  assert.equal(created[2].after, "Email, Phone");
  const removed = getAuditChanges({ size: "Large" }, {});
  assert.equal(removed[0].kind, "removed");
  assert.equal(removed[0].after, "Not recorded");
  assert.match(auditValueText("purchase_date", "2026-10-25T16:00:00Z"), /Oct 26, 2026/);
  assert.equal(auditValueText("reason", "constructor"), "constructor");
  assert.equal(auditValueText("enabled", false), "No");
});

test("audit changes render accessible comparisons and escape recorded text without showing JSON syntax", () => {
  const html = renderToStaticMarkup(createElement(AuditChanges, {
    eventId: "12", before: { selling_price: "10.00", name: "Old name" },
    after: { selling_price: "12.00", name: "<script>unsafe</script>" },
  }));
  assert.match(html, /Changes for audit event #12/);
  assert.match(html, /<dt[^>]*>Before/);
  assert.match(html, /<dt[^>]*>After/);
  assert.match(html, /Selling price/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<pre|<code|selling_price|<script>/);
  const unchanged = renderToStaticMarkup(createElement(AuditChanges, { eventId: "13", before: { status: "ACTIVE" }, after: { status: "ACTIVE" } }));
  assert.match(unchanged, /No field values changed/);
});

test("each audit changes button opens and closes its own comparison dialog", () => {
  let open = false;
  const Component = loadTs("src/components/features/AuditChanges.tsx", { react: { useState: () => [open, value => { open = value; }] } }).default;
  const props = { eventId: "42", before: { status: "PENDING" }, after: { status: "CONFIRMED" } };
  let tree = Component(props);
  const [button, dialog] = tree.props.children;
  assert.equal(button.props["aria-label"], "View changes for event #42");
  assert.equal(dialog.props.open, false);
  button.props.onClick();
  tree = Component(props);
  assert.equal(tree.props.children[1].props.open, true);
  tree.props.children[1].props.onClose();
  assert.equal(Component(props).props.children[1].props.open, false);
});
