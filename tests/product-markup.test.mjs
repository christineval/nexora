import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

const { suggestSellingPrice } = loadTs("src/lib/money.ts");

test("markup suggestions use cost plus markup with decimal-safe cent rounding", () => {
  assert.equal(suggestSellingPrice("5", 30), "6.50");
  assert.equal(suggestSellingPrice("0.05", 10), "0.06");
  assert.equal(suggestSellingPrice("0.10", 30), "0.13");
  assert.equal(suggestSellingPrice("0", 100), "0.00");
  assert.equal(suggestSellingPrice("123.45", 0), "123.45");
  assert.equal(suggestSellingPrice("9999999999.99", 0), "9999999999.99");
});

test("markup suggestions reject invalid costs, invalid percentages and prices beyond database precision", () => {
  for (const cost of ["", "-5", "1e2", "0.001", "5.", "10000000000.00", "abc"]) assert.equal(suggestSellingPrice(cost, 30), null);
  for (const markup of [-1, 101, 1.5, NaN, Infinity]) assert.equal(suggestSellingPrice("5", markup), null);
  assert.equal(suggestSellingPrice("9999999999.99", 1), null);
});

function productForm(product) {
  const state = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef(initial) { return react.useState({ current: initial })[0]; },
    useId() { return "markup-test"; },
  };
  const Component = loadTs("src/components/inventory/ProductForm.tsx", {
    react,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/ui/SnackbarProvider": { useNotifications: () => ({ notify() {}, dismiss() {} }) },
  }).default;
  let tree;
  function render() { cursor = 0; tree = Component({ product }); }
  function find(predicate, node) {
    if (arguments.length < 2) node = tree;
    if (Array.isArray(node)) return node.flatMap(item => find(predicate, item));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...find(predicate, node.props?.children)];
  }
  function input(name) { return find(node => node.props?.name === name)[0]; }
  function change(name, value) { input(name).props.onChange({ target: { value } }); render(); }
  function slider() { return find(node => node.props?.type === "range")[0]; }
  function apply() { return find(node => node.type === "button" && node.props.children === "Use suggested price")[0]; }
  render();
  return { render, input, change, slider, apply };
}

test("add-product markup updates its suggestion and applies it only when selected, preserving manual prices", () => {
  const form = productForm();
  assert.equal(form.input("quantity").props.defaultValue, 0);
  assert.equal(form.input("quantity").props.min, 0);
  assert.equal(form.input("quantity").props.max, 2147483647);
  assert.equal(form.slider().props.value, 30);
  assert.equal(form.apply().props.disabled, true);
  form.change("unitCost", "5");
  assert.equal(form.input("sellingPrice").props.value, "");
  form.apply().props.onClick(); form.render();
  assert.equal(form.input("sellingPrice").props.value, "6.50");
  form.change("sellingPrice", "8.25");
  form.slider().props.onChange({ target: { value: "50" } }); form.render();
  assert.equal(form.input("sellingPrice").props.value, "8.25");
  form.apply().props.onClick(); form.render();
  assert.equal(form.input("sellingPrice").props.value, "7.50");
  form.change("unitCost", "");
  assert.equal(form.apply().props.disabled, true);
  assert.equal(form.input("sellingPrice").props.value, "7.50");
});

test("editing an existing product preserves stored prices without displaying the add-product calculator", () => {
  const form = productForm({ productId: "1", sku: "ERP-0001", name: "Widget", unitCost: 5, sellingPrice: 8.25, stockQty: 4, status: "ACTIVE" });
  assert.equal(form.slider(), undefined);
  assert.equal(form.input("quantity"), undefined);
  assert.equal(form.input("sellingPrice").props.value, "8.25");
  form.change("unitCost", "6");
  assert.equal(form.input("sellingPrice").props.value, "8.25");
});
