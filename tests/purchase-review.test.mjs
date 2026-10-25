import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

function review({ catalog, invoice, guest = false } = {}) {
  const state = [];
  let cursor = 0;
  const submitted = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef(initial) { return react.useState({ current: initial })[0]; },
    useEffect() {},
  };
  const Component = loadTs("src/components/features/PurchaseImport.tsx", {
    react,
    "@/components/ui/GuestPreviewProvider": { useGuestPreview: () => guest },
    "@/components/ui/use-mutation": () => ({ saving: false, clearError() {}, submit: (...args) => submitted.push(args) }),
    "@/components/ui/SnackbarProvider": { useNotifications: () => ({ notify() {} }) },
    "@/lib/receipt-ocr": { maxReceiptSize: 20000000, receiptTypes: ["image/jpeg"], async readReceipt() {
      return invoice ?? "QTY DESCRIPTIONS BARCODE DISC UNIT PRICE TOTAL\n2 PCS Wrong OCR name BP-TBR-R 0.00 3.00 6.00\n1 PCS Unknown item SUP-NEW 0.00 5.00 5.00\n3 PCS Name suggestion OTHER 0.00 4.00 12.00";
    } },
  }).default;
  const products = catalog ?? [
    { productId: "1", sku: "ERP-0001", supplierProductCode: "BP-TBR-R", name: "Ball retainer", status: "ACTIVE", size: null, unitCost: 3 },
    { productId: "2", sku: "ERP-0002", supplierProductCode: "KNOWN", name: "Name suggestion", status: "ACTIVE", size: null, unitCost: 4 },
  ];
  let tree;
  function render() { cursor = 0; tree = Component({ products, parties: [{ id: "1", name: "Supplier", status: "ACTIVE" }] }); }
  function find(predicate, node) {
    if (arguments.length < 2) node = tree;
    if (Array.isArray(node)) return node.flatMap(item => find(predicate, item));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...find(predicate, node.props?.children)];
  }
  function label(name) {
    const children = find(node => node.props?.label === name)[0].props.children;
    return Array.isArray(children) ? children.find(child => child?.type === "input" || child?.type === "select") : children;
  }
  function button(text) { return find(node => node.type === "button" && (node.props.children === text || node.props.children?.[0] === text))[0]; }
  function change(name, value) { label(name).props.onChange({ target: { value } }); render(); }
  render();
  return { render, find, label, button, change, submitted };
}

test("review pills preserve edits, codes auto-match, conflicting-code suggestions require confirmation, and new codes reach the purchase payload", async () => {
  const ui = review();
  ui.label("Receipt or invoice file").props.onChange({ target: { files: [{ type: "image/jpeg", size: 10 }] } });
  ui.render();
  await ui.button("Read with OCR").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  ui.render();
  assert.equal(ui.find(node => node.props?.role === "alert").length, 0, JSON.stringify(ui.find(node => node.props?.role === "alert").map(node => node.props.children)));
  assert.equal(ui.label("Product match 1").props.value, "1");
  assert.equal(ui.label("Product match 2").props.value, "new");
  assert.equal(ui.label("Product match 3").props.value, "suggested");
  assert.equal(ui.find(node => node.props?.["aria-pressed"] !== undefined).length, 3);
  const pills = () => ui.find(node => node.props?.["aria-pressed"] !== undefined);
  pills()[2].props.onClick(); ui.render();
  assert.equal(ui.find(node => node.props?.hidden === true).length, 2);
  ui.change("Supplier product code 2", "CORRECTED/001");
  assert.equal(ui.find(node => /^Product name \d+$/.test(node.props?.label)).length, 3);
  assert.equal(ui.find(node => /^New product name/.test(node.props?.label)).length, 0);
  assert.equal(ui.find(node => /^Internal SKU/.test(node.props?.label)).length, 0);
  assert.equal(ui.find(node => node.type === "details").length, 3);
  assert.equal(ui.find(node => node.props?.["aria-label"] === "New product details 2")[0].props.open, undefined);
  assert.equal(ui.find(node => node.props?.children === "Matched").length, 1);
  assert.equal(ui.find(node => /^Selling price/.test(node.props?.label)).length, 1);
  ui.change("Product name 2", "Corrected name");
  ui.change("Size 2", "Small");
  ui.change("Unit cost 2 (PHP)", "6.25");
  ui.change("Selling price 2 (PHP)", "7.50");
  assert.equal(ui.label("Product name 2").props.value, "Corrected name");
  pills()[1].props.onClick(); ui.render();
  assert.equal(ui.label("Supplier product code 2").props.value, "CORRECTED/001");
  assert.equal(ui.find(node => node.props?.hidden === true).length, 1);
  ui.change("Supplier", "1");
  const checkbox = () => ui.find(node => node.type === "input" && node.props.type === "checkbox")[0];
  checkbox().props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, true);
  ui.change("Product match 3", "2");
  checkbox().props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, false);
  ui.find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(ui.submitted.length, 1);
  assert.equal(ui.submitted[0][2].items[1].newProduct.name, "Corrected name");
  assert.equal(ui.submitted[0][2].items[1].newProduct.supplierProductCode, "CORRECTED/001");
  assert.equal(ui.submitted[0][2].items[1].newProduct.sellingPrice, "7.50");
  assert.equal(ui.submitted[0][2].items[1].newProduct.size, "Small");
  assert.equal(ui.submitted[0][2].items[1].newProduct.unitCost, "6.25");
  assert.equal(ui.submitted[0][2].items[1].quantity, 1);
  assert.equal(ui.submitted[0][2].items[0].productId, "1");
  assert.equal(ui.submitted[0][2].items[1].newProduct.sku, undefined);
  assert.equal(ui.submitted[0][0], "/api/purchases/import");
  assert.match(ui.submitted[0][2].importKey, /^[0-9a-f-]{36}$/);
  ui.find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(ui.submitted[1][2].importKey, ui.submitted[0][2].importKey);
});

test("a missing supplier names the missing selection, while a zero quantity reports its invoice line and rule", async () => {
  const ui = review({
    catalog: [{ productId: "1", name: "Ball retainer", supplierProductCode: "BP-TBR-R", status: "ACTIVE", unitCost: 5 }],
    invoice: "2 PCS Ball retainer BP-TBR-R 0.00 5.00 10.00",
  });
  ui.label("Receipt or invoice file").props.onChange({ target: { files: [{ type: "image/jpeg", size: 10 }] } }); ui.render();
  ui.button("Read with OCR").props.onClick(); await new Promise(resolve => setImmediate(resolve)); ui.render();
  const checkbox = () => ui.find(node => node.type === "input" && node.props.type === "checkbox")[0];
  checkbox().props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, true);
  assert.equal(ui.find(node => node.type === "li" && node.props.children === "Select a supplier before saving.").length, 1);
  assert.equal(ui.label("Supplier").props["aria-invalid"], true);
  assert.equal(ui.find(node => node.props?.children === "Select a valid record.").length, 0);
  ui.change("Supplier", "1");
  ui.change("Quantity 1", "0");
  checkbox().props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.find(node => node.type === "li" && /Invoice line 1:.*greater than zero/.test(node.props.children)).length, 1);
  assert.equal(ui.button("Save received purchase").props.disabled, true);
});

test("an existing product with a transposed supplier code is a review suggestion, not a new product, and confirmation submits its existing ID", async () => {
  const ui = review({
    catalog: [{ productId: "1", name: "BALL RETAINER REAR PRX", sku: "ERP-0001", supplierProductCode: "BP-TRB-R", status: "ACTIVE", unitCost: 3 }],
    invoice: "QTY DESCRIPTIONS BARCODE DISC UNIT PRICE TOTAL\n100 PCS BP, BALL RETAINER REAR PRX BP-TBR-R 0.00 3.00 300.00",
  });
  ui.label("Receipt or invoice file").props.onChange({ target: { files: [{ type: "image/jpeg", size: 10 }] } }); ui.render();
  ui.button("Read with OCR").props.onClick(); await new Promise(resolve => setImmediate(resolve)); ui.render();
  assert.equal(ui.label("Product match 1").props.value, "suggested");
  assert.equal(ui.find(node => node.props?.children === "New product").length, 0);
  assert.equal(ui.find(node => node.props?.children === "Review match").length, 1);
  assert.equal(ui.find(node => /^Selling price/.test(node.props?.label)).length, 0);
  ui.change("Product match 1", "suggested");
  assert.equal(ui.find(node => node.props?.children === "Review match").length, 1);
  ui.change("Product match 1", "1");
  ui.change("Supplier", "1");
  ui.find(node => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, false);
  ui.find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(ui.submitted[0][2].items[0].productId, "1");
  assert.equal(ui.submitted[0][2].items[0].newProduct, undefined);
});

test("new invoice items default to collapsed setup, flag missing quantities, and submit only after required product details are completed", async () => {
  const ui = review({ catalog: [], invoice: "PCS BASKET BALL PIN CEX BP-BB-1 0.00 5.00 5.00" });
  ui.label("Receipt or invoice file").props.onChange({ target: { files: [{ type: "image/jpeg", size: 10 }] } }); ui.render();
  ui.button("Read with OCR").props.onClick(); await new Promise(resolve => setImmediate(resolve)); ui.render();
  assert.equal(ui.find(node => node.type === "h4")[0].props.children, "BASKET BALL PIN CEX");
  assert.equal(ui.label("Product match 1").props.value, "new");
  assert.equal(ui.label("Quantity 1").props.value, "");
  assert.equal(ui.label("Quantity 1").props.placeholder, "Required");
  assert.equal(ui.label("Quantity 1").props["aria-invalid"], true);
  assert.equal(ui.find(node => node.props?.["aria-label"] === "New product details 1")[0].props.open, undefined);
  ui.change("Supplier", "1");
  ui.change("Quantity 1", "12");
  assert.equal(ui.label("Quantity 1").props["aria-invalid"], false);
  const checkbox = () => ui.find(node => node.type === "input" && node.props.type === "checkbox")[0];
  checkbox().props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, true);
  ui.change("Selling price 1 (PHP)", "8.00");
  checkbox().props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, false);
  ui.find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(ui.submitted[0][2].items[0].quantity, 12);
  assert.equal(ui.submitted[0][2].items[0].newProduct.name, "BASKET BALL PIN CEX");
  assert.equal(ui.submitted[0][2].items[0].newProduct.unitCost, "5.00");
  assert.equal(ui.submitted[0][2].items[0].newProduct.sellingPrice, "8.00");
});


test("guests can run OCR, correct invoice lines and add products but cannot save a valid reviewed purchase", async () => {
  const ui = review({ guest: true, invoice: "2 PCS Ball retainer BP-TBR-R 0.00 3.00 6.00" });
  ui.label("Receipt or invoice file").props.onChange({ target: { files: [{ type: "image/jpeg", size: 10 }] } }); ui.render();
  ui.button("Read with OCR").props.onClick(); await new Promise(resolve => setImmediate(resolve)); ui.render();
  assert.equal(ui.label("Product match 1").props.value, "1");
  ui.change("Quantity 1", "4");
  ui.change("Supplier", "1");
  ui.find(node => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, true);
  ui.find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(ui.submitted.length, 0);
  ui.find(node => node.type === "button" && node.props.children?.includes?.("Add product"))[0].props.onClick(); ui.render();
  assert.equal(ui.label("Quantity 2").props.value, "1");
});


test("compact invoice markup applies cent-rounded prices explicitly, preserves manual prices and blocks below-cost sales", async () => {
  const ui = review({ catalog: [], invoice: "2 PCS NEW ITEM NEW-001 0.00 5.00 10.00" });
  ui.label("Receipt or invoice file").props.onChange({ target: { files: [{ type: "image/jpeg", size: 10 }] } }); ui.render();
  ui.button("Read with OCR").props.onClick(); await new Promise(resolve => setImmediate(resolve)); ui.render();
  const apply = () => ui.find(node => node.props?.["aria-label"] === "Apply suggested price 1")[0];
  assert.equal(ui.label("Markup 1 (%)").props.value, "30");
  assert.equal(ui.label("Selling price 1 (PHP)").props.value, "");
  apply().props.onClick(); ui.render();
  assert.equal(ui.label("Selling price 1 (PHP)").props.value, "6.50");
  ui.change("Selling price 1 (PHP)", "8.75");
  ui.change("Markup 1 (%)", "50");
  assert.equal(ui.label("Selling price 1 (PHP)").props.value, "8.75");
  apply().props.onClick(); ui.render();
  assert.equal(ui.label("Selling price 1 (PHP)").props.value, "7.50");
  ui.change("Markup 1 (%)", "101");
  assert.equal(apply().props.disabled, true);
  ui.change("Markup 1 (%)", "30");
  ui.change("Selling price 1 (PHP)", "4.99");
  assert.equal(ui.label("Selling price 1 (PHP)").props["aria-invalid"], true);
  ui.change("Supplier", "1");
  ui.find(node => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.button("Save received purchase").props.disabled, true);
  ui.find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(ui.submitted.length, 0);
});

test("invoice preview rejects a missing-size product that overlaps an existing sized product", () => {
  const ui = review({ catalog: [{ productId: "2", sku: "ERP-0002", name: "Widget", size: "Small", status: "ACTIVE", unitCost: 5 }] });
  ui.find(node => node.type === "button" && node.props.children?.includes?.("Add product"))[0].props.onClick(); ui.render();
  ui.change("Product match 1", "new");
  ui.change("Product name 1", "Widget");
  ui.change("Product match 1", "new");
  assert.ok(ui.find(node => node.props?.role === "alert").some(node => [node.props.children].flat().join(" ").includes("different, non-empty sizes")));
});


test("invoice review blocks creating a new product with an existing barcode despite different names and sizes", () => {
  const ui = review({ catalog: [{ productId: "2", sku: "ERP-0002", name: "Archived catalog item", size: "Small", supplierProductCode: "001-AB", status: "INACTIVE", unitCost: 5 }] });
  ui.find(node => node.type === "button" && node.props.children?.includes?.("Add product"))[0].props.onClick(); ui.render();
  ui.change("Product match 1", "new");
  ui.change("Product name 1", "Different new item");
  ui.change("Size 1", "Large");
  ui.change("Supplier product code 1", "001 \u2013 ab");
  assert.ok(ui.find(node => node.props?.role === "alert").some(node => [node.props.children].flat().join(" ").includes("barcode already exists")));
  assert.equal(ui.button("Save received purchase").props.disabled, true);
});

test("invoice filters separate existing matches from new products even when new products have validation errors", async () => {
  const ui = review();
  ui.label("Receipt or invoice file").props.onChange({ target: { files: [{ type: "image/jpeg", size: 10 }] } }); ui.render();
  ui.button("Read with OCR").props.onClick(); await new Promise(resolve => setImmediate(resolve)); ui.render();
  const pills = () => ui.find(node => node.props?.["aria-pressed"] !== undefined);
  const cards = () => ui.find(node => node.type === "div" && node.props?.hidden !== undefined);
  assert.equal(pills()[1].props.children.at(-2), 2);
  assert.equal(pills()[2].props.children.at(-2), 1);
  pills()[1].props.onClick(); ui.render();
  assert.deepEqual(cards().map(card => card.props.hidden), [false, true, false]);
  pills()[2].props.onClick(); ui.render();
  assert.deepEqual(cards().map(card => card.props.hidden), [true, false, true]);
  ui.change("Selling price 2 (PHP)", "0.01");
  pills()[1].props.onClick(); ui.render();
  assert.deepEqual(cards().map(card => card.props.hidden), [false, true, false]);
  assert.equal(ui.button("Save received purchase").props.disabled, true);
  ui.change("Product match 3", "new");
  assert.equal(pills()[1].props.children.at(-2), 1);
  assert.equal(pills()[2].props.children.at(-2), 2);
  assert.deepEqual(cards().map(card => card.props.hidden), [false, true, true]);
  pills()[0].props.onClick(); ui.render();
  assert.deepEqual(cards().map(card => card.props.hidden), [false, false, false]);
});
