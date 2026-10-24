import { test, expect } from "@playwright/test";
import { sessionFor } from "./test-session.mjs";

test.beforeEach(async ({ context }) => { await context.addCookies([await sessionFor("ADMIN")]); });

test("audit log shows admin history and filters while employees cannot access it", async ({ page, context }) => {
  await page.goto("/settings/audit");
  await expect(page.getByRole("heading", { name: "Audit Log", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit Log", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Action", exact: true }).fill("LOGIN_SUCCEEDED");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page).toHaveURL(/action=LOGIN_SUCCEEDED/);
  await expect(page.getByRole("cell", { name: "LOGIN SUCCEEDED", exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/audit-log-desktop.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Audit Log", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/audit-log-mobile.png", fullPage: true, caret: "initial" });
  const response = await context.request.get("/api/audit?action=LOGIN_SUCCEEDED");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.rows.length).toBeGreaterThan(0);
  expect(data.rows.every(row => row.action === "LOGIN_SUCCEEDED")).toBe(true);
  expect(JSON.stringify(data)).not.toMatch(/password_hash|token_hash|password_fingerprint/);
  await context.clearCookies();
  await context.addCookies([await sessionFor("SALES")]);
  expect((await context.request.get("/api/audit?role=ADMIN&actorId=1")).status()).toBe(403);
  await page.goto("/settings/audit");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Audit Log", exact: true })).toHaveCount(0);
});

test("customer contact numbers accept digits only in create and edit forms", async ({ page, context }) => {
  await page.goto("/customers");
  for (const edit of [false, true]) {
    if (edit) await page.getByRole("button", { name: /^Edit / }).first().click();
    else await page.getByRole("button", { name: "Add Customer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: edit ? "Edit customer" : "Add customer", exact: true });
    const phone = dialog.getByRole("textbox", { name: "Phone", exact: true });
    await expect(phone).toHaveAttribute("type", "tel");
    await expect(phone).toHaveAttribute("inputmode", "numeric");
    await phone.fill("");
    await phone.pressSequentially("a09e+1-2.3");
    await expect(phone).toHaveValue("09123");
    expect(await phone.evaluate(element => {
      const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", "0912abc");
      return !element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    })).toBe(true);
    await expect(phone).toHaveValue("09123");
    await phone.fill("abc09123456789");
    await expect(phone).toHaveValue("09123");
    await phone.fill("09123456789");
    await expect(phone).toHaveValue("09123456789");
    await phone.fill("");
    expect(await phone.evaluate(element => element.checkValidity())).toBe(true);
    await dialog.getByRole("button", { name: "Close modal", exact: true }).click();
  }
  const invalid = await context.request.post("/api/customers", { headers: { Origin: "http://localhost:3000" }, data: { name: "Rejected contact test", email: "", phone: "0912abc", address: "", status: "ACTIVE" } });
  expect(invalid.status()).toBe(400);
});

function invoicePdf() {
  const stream = "BT /F1 20 Tf 40 750 Td (INVOICE) Tj 0 -40 Td (Keyboard 3 0.10 0.30) Tj 0 -40 Td (Mouse 2 1.20 2.40) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("purchase import reads images and PDFs locally and reviews many products without submitting invoice prices", async ({ page }) => {
  test.setTimeout(180000);
  const externalRequests = [];
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith("http://localhost:3000")) externalRequests.push(request.url()); });
  const submitted = [];
  await page.route("**/api/purchases", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Test response: purchase was not saved." }) });
  });
  await page.goto("/purchasing");
  const imageData = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, 1400, 400);
    context.fillStyle = "black"; context.font = "48px monospace";
    ["INVOICE", "Keyboard 3 0.10 0.30", "Mouse 2 1.20 2.40"].forEach((line, index) => context.fillText(line, 40, 80 + 100 * index));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const files = [{ name: "invoice.png", mimeType: "image/png", buffer: Buffer.from(imageData, "base64") }, { name: "invoice.pdf", mimeType: "application/pdf", buffer: invoicePdf() }];
  for (const [index, file] of files.entries()) {
    await page.setViewportSize({ width: index ? 390 : 1280, height: 900 });
    await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Import purchase receipt or invoice", exact: true });
    await dialog.getByLabel("Receipt or invoice file", { exact: true }).setInputFiles(file);
    await dialog.getByRole("button", { name: "Read with OCR", exact: true }).click();
    await expect(dialog.getByLabel("Extracted invoice text", { exact: true })).toHaveValue(/Keyboard/, { timeout: 90000 });
    await expect(dialog.getByRole("heading", { name: "Review products (2)", exact: true })).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "Quantity 1", exact: true })).toHaveValue("3");
    await expect(dialog.getByRole("spinbutton", { name: "Invoice unit price 1 (reference)", exact: true })).toHaveValue("0.10");
    const supplier = dialog.getByRole("combobox", { name: "Supplier", exact: true });
    const supplierId = await supplier.locator("option").evaluateAll(options => options.find(option => option.value)?.value);
    await supplier.selectOption(supplierId);
    const first = dialog.getByRole("combobox", { name: "Matched product 1", exact: true });
    const ids = await first.locator("option").evaluateAll(options => options.filter(option => /^\d+$/.test(option.value)).map(option => option.value));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    await first.selectOption(ids[0]);
    await dialog.getByRole("combobox", { name: "Matched product 2", exact: true }).selectOption(ids[0]);
    await expect(dialog.getByText("Each product can appear only once.", { exact: false })).toBeVisible();
    await dialog.getByRole("checkbox").check();
    await expect(dialog.getByRole("button", { name: "Create pending purchase", exact: true })).toBeDisabled();
    await dialog.getByRole("combobox", { name: "Matched product 2", exact: true }).selectOption(ids[1]);
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await expect(dialog.getByText("Select the matching product.", { exact: true })).toHaveCount(0);
    await dialog.getByRole("checkbox").check();
    await expect(dialog.getByText("Stored unit cost:", { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: `test-results/purchase-import-${index ? "mobile" : "desktop"}.png`, fullPage: true });
    await dialog.getByRole("button", { name: "Create pending purchase", exact: true }).click();
    await expect.poll(() => submitted.length).toBe(index + 1);
    expect(submitted.at(-1).items).toEqual([{ productId: ids[0], quantity: 3 }, { productId: ids[1], quantity: 2 }]);
    await expect(page.locator(".snackbar-viewport").getByRole("alert")).toContainText("Test response: purchase was not saved.");
    await dialog.getByRole("button", { name: "Close modal", exact: true }).click();
  }
  expect(externalRequests).toEqual([]);
});

test("highlighted invoice OCR separates numeric quantities from units and product sizes", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/purchasing");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1800; canvas.height = 550;
    const context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "28px monospace"; context.fillStyle = "black";
    [["QTY", 50], ["DESCRIPTIONS", 300], ["BARCODE", 950], ["DISC.", 1290], ["UNIT PRICE", 1400], ["TOTAL", 1640]].forEach(([label, x]) => context.fillText(label, x, 80));
    const rows = [
      ["3", "PCS", "PEDAL PLASTIC 1/2", "BP-CPP1/2", "65.00", "195.00"],
      ["10", "PAIR", "HANDLE GRIP BLACK", "BP-SHG-BK", "40.00", "400.00"],
      ["5", "PCS", "TIRE LEO 26 X 1 3/8", "BP-LT26X13/8D", "151.00", "755.00"],
    ];
    rows.forEach(([qty, unit, description, barcode, price, total], index) => {
      const y = 175 + index * 100;
      context.fillStyle = "#ff8dcb"; context.fillRect(35, y - 35, 160, 45); context.fillRect(1410, y - 35, 155, 45);
      context.strokeStyle = "#bc5263"; context.lineWidth = 2; context.beginPath(); context.ellipse(75, y - 10, 42, 35, 0, 0, Math.PI * 2); context.stroke();
      context.fillStyle = "black";
      [[qty, 50], [unit, 160], [description, 300], [barcode, 950], ["0.00", 1290], [price, 1440], [total, 1640]].forEach(([value, x]) => context.fillText(value, x, y));
    });
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import purchase receipt or invoice", exact: true });
  await dialog.getByLabel("Receipt or invoice file", { exact: true }).setInputFiles({ name: "highlighted-invoice.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await dialog.getByRole("button", { name: "Read with OCR", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Review products (3)", exact: true })).toBeVisible({ timeout: 90000 });
  for (const [index, quantity, price, description] of [[1, "3", "65.00", "PEDAL PLASTIC 1/2"], [2, "10", "40.00", "HANDLE GRIP BLACK"], [3, "5", "151.00", "TIRE LEO 26 X 1 3/8"]]) {
    await expect(dialog.getByRole("spinbutton", { name: `Quantity ${index}`, exact: true })).toHaveValue(quantity);
    await expect(dialog.getByRole("spinbutton", { name: `Invoice unit price ${index} (reference)`, exact: true })).toHaveValue(price);
    await expect(dialog.getByLabel(`Invoice description ${index}`, { exact: true })).toHaveValue(description);
  }
});

test("invoice review separates coded product rows and requires missing quantities to be entered", async ({ page }) => {
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import purchase receipt or invoice", exact: true });
  await expect(dialog.getByLabel("Extracted invoice text", { exact: true })).not.toBeVisible();
  await dialog.getByText("View or paste invoice text", { exact: true }).click();
  await dialog.getByLabel("Extracted invoice text", { exact: true }).fill("DESCRIPTIONS BARCODE DISC. UNIT PRICE TOTAL\nPCS EPSON INK REFILL 65ML 003 T00V L-EIR65-T00V1 0.00 340.00 340.00\nREAM HARD COPY PAPER SUBS 20 A4 PR OS-HCP20A4 0.00 155.00 310.00\nSUB-TOTAL >> 650.00");
  await dialog.getByRole("button", { name: "Extract product lines", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Review products (2)", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Invoice description 1", { exact: true })).toHaveValue("EPSON INK REFILL 65ML 003 T00V");
  await expect(dialog.getByLabel("Invoice unit price 1 (reference)", { exact: true })).toHaveValue("340.00");
  await expect(dialog.getByLabel(/^Quantity\ 1\s*\*?$/, { exact: true })).toHaveValue("");
  await expect(dialog.getByText("Quantity is missing or unreadable.", { exact: false })).toHaveCount(2);
  await dialog.getByLabel(/^Quantity\ 1\s*\*?$/, { exact: true }).fill("1");
  await expect(dialog.getByText("Quantity is missing or unreadable.", { exact: false })).toHaveCount(1);
  await dialog.getByLabel("Invoice description 1", { exact: true }).fill("Corrected invoice description");
  await expect(dialog.getByLabel("Invoice description 1", { exact: true })).toHaveValue("Corrected invoice description");
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Create pending purchase", exact: true })).toBeDisabled();
});

test("invoice import reviews new and existing products together and submits one purchase", async ({ page }) => {
  const submitted = [];
  await page.route("**/api/purchases", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "123" }) });
  });
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import purchase receipt or invoice", exact: true });
  await dialog.getByText("View or paste invoice text", { exact: true }).click();
  await dialog.getByLabel("Extracted invoice text", { exact: true }).fill("New store item 2 10.25 20.50\nExisting store item 3 1.00 3.00");
  await dialog.getByRole("button", { name: "Extract product lines", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Matched product 1", exact: true }).selectOption("new");
  await expect(dialog.getByLabel(/^New\ product\ name\ 1\s*\*?$/, { exact: true })).toHaveValue("New store item");
  await expect(dialog.getByLabel(/^New\ product\ unit\ cost\ 1\s*\*?$/, { exact: true })).toHaveValue("10.25");
  await expect(dialog.getByLabel(/^New\ product\ selling\ price\ 1\s*\*?$/, { exact: true })).toHaveValue("");
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Create pending purchase", exact: true })).toBeDisabled();
  await dialog.getByLabel(/^New\ product\ selling\ price\ 1\s*\*?$/, { exact: true }).fill("15.00");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByLabel("New product size 1", { exact: true }).fill("Small");
  const existing = dialog.getByRole("combobox", { name: "Matched product 2", exact: true });
  const id = await existing.locator("option").evaluateAll(options => options.find(option => /^\d+$/.test(option.value))?.value);
  await existing.selectOption(id);
  const supplier = dialog.getByRole("combobox", { name: "Supplier", exact: true });
  const supplierId = await supplier.locator("option").evaluateAll(options => options.find(option => option.value)?.value);
  await supplier.selectOption(supplierId);
  await expect(dialog.getByText("1 new product will be added to Products when saved.", { exact: true })).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Create pending purchase", exact: true })).toBeEnabled();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.getByLabel(/^New\ product\ name\ 1\s*\*?$/, { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/purchase-new-product-${width}.png`, fullPage: true });
  }
  await dialog.getByRole("button", { name: "Create pending purchase", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].items).toEqual([
    { newProduct: { name: "New store item", size: "Small", unitCost: "10.25", sellingPrice: "15.00" }, quantity: 2 },
    { productId: id, quantity: 3 },
  ]);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".snackbar-viewport")).toContainText("Purchase saved with 1 new product");
});

test("closing invoice import discards unsaved data through the close button and Escape", async ({ page }) => {
  await page.goto("/purchasing");
  const dialog = page.getByRole("dialog", { name: "Import purchase receipt or invoice", exact: true });
  for (const closeWithEscape of [false, true]) {
    await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
    const initialDate = await dialog.getByLabel(/^Purchase\ date\s*\*?$/, { exact: true }).inputValue();
    const details = dialog.locator("details");
    if (!(await details.evaluate(element => element.open))) await details.locator("summary").click();
    await dialog.getByLabel("Receipt or invoice file", { exact: true }).setInputFiles({ name: "invoice.png", mimeType: "image/png", buffer: Buffer.from("selected file") });
    await dialog.getByLabel("Extracted invoice text", { exact: true }).fill("Unsaved product 2 10.00 20.00");
    await dialog.getByRole("button", { name: "Extract product lines", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Matched product 1", exact: true }).selectOption("new");
    await dialog.getByLabel(/^New\ product\ selling\ price\ 1\s*\*?$/, { exact: true }).fill("15.00");
    const supplier = dialog.getByRole("combobox", { name: "Supplier", exact: true });
    const supplierId = await supplier.locator("option").evaluateAll(options => options.find(option => option.value)?.value);
    await supplier.selectOption(supplierId);
    await dialog.getByLabel(/^Purchase\ date\s*\*?$/, { exact: true }).fill("2025-01-01");
    await dialog.getByRole("checkbox").check();
    if (closeWithEscape) await dialog.press("Escape");
    else await dialog.getByRole("button", { name: "Close modal", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
    await expect(dialog.getByLabel("Receipt or invoice file", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Extracted invoice text", { exact: true })).toHaveValue("");
    await expect(dialog.getByRole("heading", { name: "Review products (0)", exact: true })).toBeVisible();
    await expect(supplier).toHaveValue("");
    await expect(dialog.getByLabel(/^Purchase\ date\s*\*?$/, { exact: true })).toHaveValue(initialDate);
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await expect(dialog.getByRole("button", { name: "Read with OCR", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close modal", exact: true }).click();
  }
});

test("purchase import rejects unsupported files and remains hidden for read-only users", async ({ page, context }) => {
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import purchase receipt or invoice", exact: true });
  await dialog.getByLabel("Receipt or invoice file", { exact: true }).setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("text") });
  await expect(dialog.getByRole("alert")).toContainText("under 20 MB");
  await expect(dialog.getByRole("button", { name: "Read with OCR", exact: true })).toBeDisabled();
  const tinyImage = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 100;
    const context = canvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, 400, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.getByLabel("Receipt or invoice file", { exact: true }).setInputFiles({ name: "cancel.png", mimeType: "image/png", buffer: Buffer.from(tinyImage, "base64") });
  await dialog.getByRole("button", { name: "Read with OCR", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel OCR", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Read with OCR", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Cancel OCR", exact: true })).toHaveCount(0);
  await context.clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "View as guest", exact: true }).click();
  await page.goto("/purchasing");
  await expect(page.getByRole("button", { name: "Import Receipt / Invoice", exact: true })).toHaveCount(0);
});

test("numeric form inputs reject text and sales calendars block future dates", async ({ page }) => {
  await page.goto("/sales/new");
  const dialog = page.getByRole("dialog", { name: "Create Sales Order", exact: true });
  const quantity = dialog.getByRole("spinbutton", { name: "Quantity", exact: true });
  await quantity.fill("");
  await quantity.pressSequentially("a1e+2-.3");
  await expect(quantity).toHaveValue("123");
  const blocked = await quantity.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "12abc");
    return !element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  expect(blocked).toBe(true);
  await expect(quantity).toHaveValue("123");
  const date = dialog.getByLabel(/^Order\ date\s*\*?$/, { exact: true });
  const maximum = await date.getAttribute("max");
  expect(maximum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await date.fill("2099-01-01");
  expect(await date.evaluate(element => element.validity.rangeOverflow)).toBe(true);
  await date.fill(maximum);
  expect(await date.evaluate(element => element.checkValidity())).toBe(true);
  await page.goto("/purchasing/new");
  await expect(page.getByRole("dialog", { name: "Create Purchase Order", exact: true }).getByLabel(/^Purchase\ date\s*\*?$/)).not.toHaveAttribute("max");
  await page.goto("/inventory/movements");
  await page.getByRole("button", { name: "Adjust Stock", exact: true }).click();
  const adjustment = page.getByRole("spinbutton", { name: "Quantity", exact: true });
  await adjustment.pressSequentially("a1e+2-.3");
  await expect(adjustment).toHaveValue("123");
  await page.goto("/inventory/products");
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  for (const label of ["Unit cost (PHP)", "Selling price (PHP)"]) {
    const price = page.getByRole("spinbutton", { name: new RegExp(label.replace(/[()]/g, "\\$&")) });
    await price.fill("");
    await price.pressSequentially("a1e+2-.34");
    await expect(price).toHaveValue("12.34");
  }
});

test("sales customer tabs switch fields, preserve draft values, and submit only the active customer mode", async ({ page }) => {
  const submitted = [];
  await page.route("**/api/orders", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Test response: order was not saved." }) });
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sales/new");
    const dialog = page.getByRole("dialog", { name: "Create Sales Order", exact: true });
    const registered = dialog.getByRole("tab", { name: "Registered Customers", exact: true });
    const walkIn = dialog.getByRole("tab", { name: "Walk-in Customers", exact: true });
    await expect(registered).toHaveAttribute("aria-selected", "true");
    const customer = dialog.getByRole("combobox", { name: "Customer", exact: true });
    const customerId = await customer.locator("option").evaluateAll(options => options.find(option => option.value)?.value);
    await customer.selectOption(customerId);
    const product = dialog.getByRole("combobox", { name: "Product 1", exact: true });
    const productId = await product.locator("option").evaluateAll(options => options.find(option => option.value)?.value);
    await product.selectOption(productId);
    await dialog.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
    await walkIn.click();
    await expect(customer).toHaveCount(0);
    const name = dialog.getByRole("textbox", { name: "Customer name", exact: true });
    await expect(dialog.getByRole("button", { name: "Create pending order", exact: true })).toBeDisabled();
    await name.fill("  Walk-in test buyer  ");
    await walkIn.focus();
    await page.keyboard.press("ArrowRight");
    await expect(registered).toBeFocused();
    await expect(customer).toHaveValue(customerId);
    await expect(name).toHaveCount(0);
    await dialog.getByRole("button", { name: "Create pending order", exact: true }).click();
    await expect.poll(() => submitted.length).toBe(width === 1280 ? 1 : 3);
    expect(submitted.at(-1).partyId).toBe(customerId);
    expect(submitted.at(-1).walkInCustomer).toBeUndefined();
    await registered.focus();
    await page.keyboard.press("Home");
    await expect(walkIn).toBeFocused();
    await expect(name).toHaveValue("  Walk-in test buyer  ");
    await expect(product).toHaveValue(productId);
    await dialog.getByRole("button", { name: "Create pending order", exact: true }).click();
    await expect.poll(() => submitted.length).toBe(width === 1280 ? 2 : 4);
    expect(submitted.at(-1).walkInCustomer).toEqual({ name: "Walk-in test buyer" });
    expect(submitted.at(-1).partyId).toBeUndefined();
    expect(submitted.at(-1).items).toEqual([{ productId, quantity: 2 }]);
    const bounds = await dialog.getByRole("tablist").boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  }
  await page.goto("/purchasing/new");
  await expect(page.getByRole("tablist", { name: "Customer type" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Supplier", exact: true })).toBeVisible();
});

test("dashboard shows recent orders and keeps currency axis labels within the chart", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Recent Orders", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Popular Products", exact: true })).toHaveCount(0);
    const card = page.locator('[aria-labelledby="recent-orders-heading"]');
    await expect(card.getByRole("link", { name: "View All sales orders", exact: true })).toHaveAttribute("href", "/sales");
    const orders = card.getByRole("listitem");
    expect(await orders.count()).toBeGreaterThan(0);
    expect(await orders.count()).toBeLessThanOrEqual(4);
    const labels = page.locator(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value");
    await expect(labels.first()).toBeVisible();
    await expect.poll(() => labels.evaluateAll(elements => elements.every(element => {
      const text = element.getBoundingClientRect();
      const chart = element.closest("svg").getBoundingClientRect();
      return text.left >= chart.left && text.right <= chart.right && text.width > 0;
    }))).toBe(true);
    if (width === 1440) await page.screenshot({ path: "test-results/dashboard-recent-orders.png", fullPage: true });
  }
});

test("sales product selection keeps fields aligned and stock details below the product", async ({ page }) => {
  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sales");
    await page.getByRole("button", { name: "New Order", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create Sales Order", exact: true });
    const product = dialog.getByRole("combobox", { name: "Product 1", exact: true });
    const quantity = dialog.getByRole("spinbutton", { name: "Quantity", exact: true });
    const amount = dialog.getByText("Line total", { exact: true }).locator("..").locator("div");
    const before = await Promise.all([product.boundingBox(), quantity.boundingBox(), amount.boundingBox()]);
    const productId = await product.locator("option").evaluateAll(options => options.find(option => option.value)?.value);
    expect(productId).toBeTruthy();
    await product.selectOption(productId);
    const details = dialog.getByText(/\/ unit .* in stock/);
    await expect(details).toBeVisible();
    const after = await Promise.all([product.boundingBox(), quantity.boundingBox(), amount.boundingBox()]);
    for (let index = 0; index < after.length; index++) {
      expect(after[index].y).toBeCloseTo(before[index].y, 0);
      expect(after[index].y).toBeCloseTo(after[0].y, 0);
    }
    const detailBounds = await details.boundingBox();
    expect(detailBounds.x).toBeCloseTo(after[0].x, 0);
    expect(detailBounds.y).toBeGreaterThanOrEqual(after[0].y + after[0].height);
  }
});

test("form feedback floats above modals, repeats, dismisses and survives a successful save", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let succeed = false;
  await page.route("**/api/customers", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: succeed ? 201 : 409, contentType: "application/json", body: JSON.stringify(succeed ? { id: "1" } : { message: "Customer could not be saved. Please try again." }) });
  });
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add customer", exact: true });
  await dialog.getByLabel(/^Name\s*\*?$/, { exact: true }).fill("Snackbar test");
  const snackbar = page.locator(".snackbar-viewport");
  for (let attempt = 0; attempt < 2; attempt++) {
    await dialog.getByRole("button", { name: "Save customer", exact: true }).click();
    await expect(snackbar.getByRole("alert")).toContainText("Customer could not be saved.");
    await expect(snackbar.locator('[data-severity="error"]')).toHaveClass(/bg-red-700/);
    expect(await snackbar.evaluate(element => element.matches(":popover-open"))).toBe(true);
    const bounds = await snackbar.boundingBox();
    expect(bounds.y).toBeCloseTo(16, 0);
    expect(bounds.x + bounds.width).toBeCloseTo(page.viewportSize().width - 16, 0);
    await expect(dialog).toBeVisible();
    await snackbar.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(snackbar).toHaveCount(0);
  }
  succeed = true;
  await dialog.getByRole("button", { name: "Save customer", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(snackbar.getByRole("status")).toContainText("Customer saved successfully.");
  await expect(snackbar.locator('[data-severity="success"]')).toHaveClass(/bg-emerald-700/);
  expect(await snackbar.evaluate(element => element.parentElement === document.body)).toBe(true);
  await page.screenshot({ path: "test-results/snackbar-success.png", fullPage: true });
  await page.clock.install();
  await snackbar.hover();
  await page.clock.fastForward(11000);
  await expect(snackbar).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(4000);
  await expect(snackbar).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(snackbar).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("sidebar shows a slim scrollbar on hover and keyboard focus while lower navigation remains reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto("/customers");
  await page.getByRole("heading", { name: "Customers", exact: true }).waitFor();
  await page.locator("html").evaluate(element => element.setAttribute("data-theme", "light"));
  const sidebar = page.locator("aside.sidebar-scroll:visible");
  await page.mouse.move(1000, 400);
  const scroll = await sidebar.evaluate(element => ({
    scrollbar: getComputedStyle(element).scrollbarWidth,
    color: getComputedStyle(element).scrollbarColor,
    overflow: getComputedStyle(element).overflowY,
    scrollable: element.scrollHeight > element.clientHeight,
  }));
  expect(scroll).toEqual({ scrollbar: "thin", color: "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)", overflow: "auto", scrollable: true });
  const initialWidth = await sidebar.evaluate(element => element.clientWidth);
  await sidebar.hover();
  await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).scrollbarColor)).toBe("rgb(148, 163, 184) rgba(0, 0, 0, 0)");
  expect(await sidebar.evaluate(element => element.clientWidth)).toBe(initialWidth);
  await page.mouse.move(1000, 400);
  await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).scrollbarColor)).toBe(scroll.color);
  await sidebar.getByRole("link", { name: "Dashboard", exact: true }).focus();
  await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).scrollbarColor)).toBe("rgb(148, 163, 184) rgba(0, 0, 0, 0)");
  await page.locator("html").evaluate(element => element.setAttribute("data-theme", "dark"));
  await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).scrollbarColor)).toBe("rgb(82, 82, 82) rgba(0, 0, 0, 0)");
  await sidebar.getByRole("link", { name: "Settings", exact: true }).scrollIntoViewIfNeeded();
  expect(await sidebar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("feature pages load database data and open creation, editing and detail modals", async ({ page }) => {
  for (const [path, heading, add, dialog] of [["/customers", "Customers", "Add Customer", "Add customer"], ["/suppliers", "Suppliers", "Add Supplier", "Add supplier"], ["/sales", "Sales Orders", "New Order", "Create Sales Order"], ["/purchasing", "Purchase Orders", "New Purchase Order", "Create Purchase Order"], ["/settings/users", "Users", "Add User", "Add user"]]) {
    await page.goto(path); await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("button", { name: add, exact: true }).click();
    const formDialog = page.getByRole("dialog", { name: dialog, exact: true });
    await expect(formDialog).toBeVisible();
    const missingRequiredMarkers = await formDialog.locator("input[required], select[required], textarea[required]").evaluateAll(fields => fields.filter(field => !Array.from(field.labels ?? []).some(label => label.querySelector("span.text-red-500[aria-hidden='true']"))).map(field => field.name || field.id || field.tagName));
    expect(missingRequiredMarkers).toEqual([]);
    if (path === "/sales" || path === "/purchasing") await page.screenshot({ path: `test-results/${path.slice(1)}-form-labels.png`, fullPage: true });
    await page.getByRole("button", { name: "Close modal" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await page.goto("/inventory/products");
  await page.getByRole("button", { name: /^Edit / }).first().click();
  await expect(page.getByRole("dialog", { name: "Edit product" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Close modal" }).click();
  await page.screenshot({ path: "test-results/products.png", fullPage: true });
  await page.goto("/sales");
  await page.getByRole("button", { name: /^Actions for order / }).first().click();
  await expect(page.getByRole("dialog", { name: "Order actions" })).toBeVisible();
  await page.getByRole("button", { name: "Close modal" }).click();
  await page.goto("/finance/ledger");
  await page.getByRole("button", { name: /^View ledger entry / }).first().click();
  await expect(page.getByRole("dialog", { name: "Ledger entry details" })).toBeVisible();
  await page.getByRole("button", { name: "Close modal" }).click();
  await page.goto("/inventory/movements");
  await page.getByRole("button", { name: "Adjust Stock" }).click();
  await expect(page.getByRole("dialog", { name: "Adjust inventory" })).toBeVisible();
  await page.getByRole("button", { name: "Close modal" }).click();
  await page.getByRole("button", { name: /^View movement / }).first().click();
  await expect(page.getByRole("dialog", { name: "Inventory movement details" })).toBeVisible();
});

test("shared search, pagination, date filters and report empty states work", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("searchbox", { name: "Search customers" }).fill("no-such-customer-fixture");
  await expect(page.getByText("No records match your filters")).toBeVisible();
  await expect(page.getByText("Showing 0 to 0 of 0 customers")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Showing 9 to 16 of", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(page.getByText("Showing 9 to 16 of", { exact: false })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search customers" }).fill("no-such-customer-fixture");
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.screenshot({ path: "test-results/customers.png", fullPage: true });
  for (const path of ["/finance/ledger", "/reports/sales", "/reports/purchases", "/reports/inventory", "/inventory/movements", "/settings"]) {
    await page.goto(path); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Unable to load this page")).not.toBeVisible();
  }
  await page.goto("/reports/sales");
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  await page.getByLabel("From (PH time)").fill("2099-01-01");
  await expect(page.getByText("No transactions in this period.")).toBeVisible();
  await page.screenshot({ path: "test-results/sales-report.png", fullPage: true });
});

test("all feature lists share Products numbered pagination", async ({ page }) => {
  for (const path of ["/inventory/products", "/inventory/movements", "/customers", "/suppliers", "/sales", "/purchasing", "/finance/ledger", "/reports/sales", "/reports/purchases", "/reports/inventory", "/settings/users"]) {
    await page.goto(path);
    const navigation = page.getByRole("navigation", { name: /pagination$/ });
    await expect(navigation).toHaveCount(1);
    await expect(navigation.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(navigation.getByRole("button", { name: "Previous page" })).toBeDisabled();
    const numberedButtons = navigation.getByRole("button", { name: /^Page \d+$/ });
    expect(await numberedButtons.count()).toBeLessThanOrEqual(3);
    const secondPage = navigation.getByRole("button", { name: "Page 2", exact: true });
    if (await secondPage.count()) {
      await secondPage.click();
      await expect(secondPage).toHaveAttribute("aria-current", "page");
      await expect(navigation.getByRole("button", { name: "Previous page" })).toBeEnabled();
    } else {
      await expect(navigation.getByRole("button", { name: "Next page" })).toBeDisabled();
    }
  }
});

test("customer and supplier histories use shared pagination", async ({ page }) => {
  for (const [path, history] of [["/customers", "Sales history"], ["/suppliers", "Purchase history"]]) {
    await page.goto(path);
    await page.getByRole("button", { name: /^Details for / }).first().click();
    const historyLink = page.getByRole("link", { name: /^View (sales|purchase) history/ });
    const href = await historyLink.getAttribute("href");
    await page.goto(href);
    await expect(page.getByRole("heading", { name: history, exact: true })).toBeVisible();
    const navigation = page.getByRole("navigation", { name: history + " pagination", exact: true });
    await expect(navigation.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(navigation.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await page.getByRole("searchbox", { name: "Search " + history.toLowerCase() }).fill("no-history-fixture");
    await expect(page.getByText("Showing 0 to 0 of 0 " + history.toLowerCase(), { exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Next page" })).toBeDisabled();
  }
});

test("permissions deny unauthorized mutations and restrict navigation", async ({ page, context, request }) => {
  const anonymous = await request.post("/api/products", { headers: { Origin: "http://localhost:3000" }, data: {} });
  expect(anonymous.status()).toBe(401);
  await context.clearCookies(); await context.addCookies([await sessionFor("SALES")]);
  await page.goto("/inventory/products");
  await expect(page.getByRole("button", { name: "Add Product" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "General Ledger", exact: true })).toHaveCount(0);
  const denied = await context.request.post("/api/products", { headers: { Origin: "http://localhost:3000" }, data: {} });
  expect(denied.status()).toBe(403);
  await page.goto("/finance/ledger"); await expect(page).toHaveURL(/\/dashboard$/);
});

test("responsive tables and modals stay usable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "New Purchase Order", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create Purchase Order" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create pending purchase" })).toBeVisible();
  await page.screenshot({ path: "test-results/purchase-mobile.png", fullPage: true });
});

test("login page displays safe sign-in errors", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("no-such-login-test@invalid.example");
  await page.getByLabel("Password", { exact: true }).fill("Invalid-password-test");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});


test("guest entry browses all modules, blocks writes, and offers header controls", async ({ page, context }) => {
  test.setTimeout(120000);
  await context.clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "View as guest", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Viewing as Guest. All modules are read-only and show mock data. No live business records are displayed.")).toBeVisible();
  for (const path of ["/sales", "/customers", "/inventory/products", "/inventory/movements", "/purchasing", "/suppliers", "/finance/ledger", "/reports/sales", "/reports/purchases", "/reports/inventory", "/settings/users", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Unable to load this page")).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^(Add (Product|Customer|Supplier|User)|New Order|New Purchase Order|Adjust Stock|Change password|Edit |Actions for order )/ })).toHaveCount(0);
  }
  for (const [method, path] of [["post", "/api/products"], ["patch", "/api/products/1"], ["post", "/api/customers"], ["patch", "/api/customers/1"], ["post", "/api/suppliers"], ["patch", "/api/suppliers/1"], ["post", "/api/orders"], ["patch", "/api/orders/1"], ["post", "/api/purchases"], ["patch", "/api/purchases/1"], ["post", "/api/inventory/adjustments"], ["post", "/api/users"], ["patch", "/api/users/1"], ["post", "/api/auth/password"]]) {
    const response = await context.request[method](path, { headers: { Origin: "http://localhost:3000" }, data: {} });
    expect(response.status(), path).toBe(403);
  }
  for (const path of ["/sales/new", "/purchasing/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path.replace("/new", "") + "$"));
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.goto("/customers");
  await page.getByRole("button", { name: /^Details for / }).first().click();
  await expect(page.getByRole("dialog", { name: "Details: customer" })).toBeVisible();
  const historyLink = page.getByRole("link", { name: /^View sales history/ });
  await page.goto(await historyLink.getAttribute("href"));
  await expect(page.getByRole("heading", { name: "Sales history", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await page.goto("/sales");
  await page.getByRole("button", { name: /^View order / }).first().click();
  await expect(page.getByRole("dialog", { name: "Order details", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close modal" }).click();
  const account = page.getByRole("button", { name: "Account: Guest", exact: true });
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toHaveCount(0);
  await account.click();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByText("No notifications yet")).toBeVisible();
  await page.getByRole("heading", { name: "Sales Orders", exact: true }).click();
  await expect(page.getByText("No notifications yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Light mode", exact: true }).click();
  await page.screenshot({ path: "test-results/guest-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(account).toBeVisible();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  await account.click();
  await page.screenshot({ path: "test-results/guest-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard"); await expect(page).toHaveURL(/\/login$/);
});
