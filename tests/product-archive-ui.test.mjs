import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const rows = [
  { productId: "1", sku: "ERP-0001", name: "Active item", stockQty: 10, status: "ACTIVE" },
  { productId: "2", sku: "ERP-0002", name: "Archived item", stockQty: 0, status: "INACTIVE" },
  { productId: "3", sku: "ERP-0003", name: "Discontinued item", stockQty: 3, status: "DISCONTINUED" },
];
function harness(props = {}) {
  const state = [], submissions = [];
  let cursor = 0, tree;
  const react = { useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  } };
  const Component = loadTs("src/components/inventory/ProductTable.tsx", {
    react,
    "next/link": { __esModule: true, default: "a" },
    "@mui/x-data-grid": { DataGrid: "grid" },
    "@/components/inventory/ProductForm": { __esModule: true, default: "product-form" },
    "@/components/ui/Modal": { __esModule: true, default: "modal" },
    "@/components/ui/GuestPreviewProvider": { useGuestPreview: () => props.guest ?? false },
    "@/components/ui/use-mutation": { __esModule: true, default: () => ({ saving: false, submit(...args) { submissions.push(args); } }) },
    "@/components/ui/SnackbarProvider": { useNotifications: () => ({ notify() {} }) },
  }).default;
  function render() { cursor = 0; tree = Component({ rows, canDelete: true, ...props }); }
  function find(predicate, node = tree) {
    if (Array.isArray(node)) return node.flatMap(child => find(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...find(predicate, node.props?.children ?? null)];
  }
  function button(label) { return find(node => node.type === "button" && node.props.children === label)[0]; }
  function openActions(product) {
    const grid = find(node => node.type === "grid")[0];
    const cell = grid.props.columns.find(column => column.field === "actions").renderCell({ row: product, tabIndex: 0 });
    find(node => node.props?.title === "More actions", cell)[0].props.onClick(); render();
  }
  render();
  return { find, button, render, openActions, submissions };
}

test("active and archived catalog views separate products, including discontinued products", () => {
  const ui = harness();
  const grid = () => ui.find(node => node.type === "grid")[0];
  assert.deepEqual(grid().props.rows.map(row => row.productId), ["1"]);
  ui.find(node => node.type === "button" && node.props["aria-pressed"] === false)[0].props.onClick(); ui.render();
  assert.deepEqual(grid().props.rows.map(row => row.productId), ["2", "3"]);
});

test("archiving stock requires a warning acknowledgement and restoration has its own action", () => {
  const ui = harness();
  ui.openActions(rows[0]);
  ui.button("Archive product").props.onClick(); ui.render();
  const warning = ui.find(node => node.props?.name === "acknowledgeStock")[0];
  assert.equal(warning.props.required, true);
  assert.equal(warning.props.type, "checkbox");
  assert.equal(ui.button("Permanently delete product"), undefined);
  const archived = harness();
  archived.openActions(rows[1]);
  assert.ok(archived.button("Restore product"));
  archived.button("Restore product").props.onClick(); archived.render();
  assert.equal(archived.find(node => node.props?.name === "password").length, 0);
});

test("permanent deletion asks for current password and blocks visible nonzero stock", () => {
  const ui = harness();
  ui.openActions(rows[1]);
  ui.button("Permanently delete product").props.onClick(); ui.render();
  const password = ui.find(node => node.props?.name === "password")[0];
  assert.equal(password.props.type, "password");
  assert.equal(password.props.autoComplete, "current-password");
  assert.equal(password.props.required, true);
  assert.equal(ui.button("Permanently delete").props.disabled, false);
  const stock = harness();
  stock.openActions(rows[2]);
  stock.button("Permanently delete product").props.onClick(); stock.render();
  assert.equal(stock.button("Permanently delete").props.disabled, true);
});

test("non-admins have no delete action and read-only users and guests have no lifecycle actions", () => {
  const staff = harness({ canDelete: false });
  staff.openActions(rows[1]);
  assert.ok(staff.button("Restore product"));
  assert.equal(staff.button("Permanently delete product"), undefined);
  for (const props of [{ canEdit: false }, { canEdit: false, guest: true }]) {
    const ui = harness(props);
    ui.openActions(rows[0]);
    assert.equal(ui.button("Archive product"), undefined);
    ui.openActions(rows[1]);
    assert.equal(ui.button("Restore product"), undefined);
    assert.equal(ui.button("Permanently delete product"), undefined);
    assert.equal(ui.submissions.length, 0);
  }
});
