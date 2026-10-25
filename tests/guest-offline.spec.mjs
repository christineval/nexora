import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

async function openGuestPreview(page, context) {
  // Exercise database-independent form previews using a signed guest session.
  // Guest sign-in and API rate limiting themselves require PostgreSQL.
  const issued = Date.now();
  const payload = Buffer.from(JSON.stringify({ kind: "guest", issued, expires: issued + 3600000 })).toString("base64url");
  const signature = createHmac("sha256", "guest-offline-test-signing-secret-at-least-32-characters").update(payload).digest("base64url");
  await context.addCookies([{ name: "nexora_session", value: payload + "." + signature, url: "http://localhost:3301", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/dashboard");
}

test("guest forms stay interactive while every final commit remains disabled", async ({ page, context }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await openGuestPreview(page, context);
  await expect(page).toHaveURL(/\/dashboard$/);
  const writes = [];
  page.on("request", request => {
    if (/\/api\//.test(request.url()) && ["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url());
  });
  for (const [path, opener, commit] of [
    ["/customers", "Add Customer", "Save customer"],
    ["/suppliers", "Add Supplier", "Save supplier"],
    ["/settings/users", "Add User", "Save user"],
    ["/inventory/movements", "Adjust Stock", "Confirm adjustment"],
    ["/settings", "Change password", "Update password"],
  ]) {
    await page.goto(path);
    await page.getByRole("button", { name: opener, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: commit, exact: true })).toBeDisabled();
    await expect(dialog.locator("input").first()).toBeEnabled();
    await dialog.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  }
  for (const [path, commit] of [["/customers", "Save customer"], ["/suppliers", "Save supplier"], ["/settings/users", "Save user"]]) {
    await page.goto(path);
    await page.getByRole("button", { name: /^Edit / }).first().click();
    await expect(page.getByRole("dialog").getByRole("button", { name: commit, exact: true })).toBeDisabled();
  }
  await page.goto("/inventory/products");
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Product name\s*\*?$/).fill("Guest draft");
  await dialog.getByLabel(/^Unit cost \(PHP\)\s*\*?$/).fill("10");
  await dialog.getByRole("button", { name: "Use suggested price", exact: true }).click();
  await expect(dialog.getByLabel(/^Selling price \(PHP\)\s*\*?$/)).toHaveValue("13.00");
  await expect(dialog.getByRole("button", { name: "Create product", exact: true })).toBeDisabled();
  await dialog.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await page.getByRole("button", { name: "Close modal" }).click();
  await page.getByRole("button", { name: /^Edit / }).first().click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  for (const path of ["/sales/new", "/purchasing/new"]) {
    await page.goto(path);
    const order = page.getByRole("dialog");
    await expect(order).toBeVisible();
    await order.getByRole("button", { name: "Add line", exact: true }).click();
    await expect(order.getByRole("combobox", { name: "Product 2", exact: true })).toBeEnabled();
    await expect(order.getByRole("button", { name: /^Create pending/ })).toBeDisabled();
    await order.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  }
  for (const path of ["/sales", "/purchasing"]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Actions for order " + (path === "/sales" ? "900015" : "910015"), exact: true }).click();
    await page.getByRole("button", { name: "Edit pending order", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Save pending order", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Close modal" }).click();
    await page.getByRole("button", { name: "Actions for order " + (path === "/sales" ? "900015" : "910015"), exact: true }).click();
    await page.getByRole("button", { name: "Cancel order", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
  }
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
  dialog = page.getByRole("dialog");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 2000; canvas.height = 450;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black"; ctx.font = "40px monospace";
    ["Demo Supplier 1", "QTY DESCRIPTIONS BARCODE DISC UNIT PRICE TOTAL", "2 PCS Demo Notebook NOTE-001 0.00 100.00 200.00"].forEach((line, i) => ctx.fillText(line, 50, 90 + i * 100));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.getByLabel("Receipt or invoice file", { exact: true }).setInputFiles({ name: "guest-invoice.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await dialog.getByRole("button", { name: "Read with OCR", exact: true }).click();
  await expect(dialog.getByLabel(/^Quantity 1\s*\*?$/)).toHaveValue("2", { timeout: 90000 });
  await dialog.getByLabel(/^Quantity 1\s*\*?$/).fill("3");
  await dialog.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(dialog.getByLabel(/^Quantity 2\s*\*?$/)).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Save received purchase", exact: true })).toBeDisabled();
  await dialog.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toEqual([]);
});

test("invoice markup and duplicate validations work in compact desktop and mobile previews", async ({ page, context }) => {
  page.setDefaultTimeout(15000);
  await openGuestPreview(page, context);
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Name", exact: true }).fill("  DEMO   CUSTOMER 1 ");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("name already exists");
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Add User", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Email", exact: true }).fill("ADMIN@nexora-demo.example");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("email already exists");
  await page.goto("/inventory/products");
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Product name", exact: true }).fill("demo notebook");
  await expect(dialog.getByRole("alert")).toContainText("different, non-empty sizes");
  await dialog.getByRole("textbox", { name: "Product name", exact: true }).fill("Different product");
  await dialog.getByRole("spinbutton", { name: "Unit cost (PHP)", exact: true }).fill("10.00");
  await dialog.getByRole("textbox", { name: "Selling price (PHP)", exact: true }).fill("9.99");
  await expect(dialog.getByRole("alert")).toContainText("lower than unit cost");
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Add product", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Product match 1", exact: true }).selectOption("new");
  await dialog.locator("details summary").first().click();
  await dialog.getByRole("textbox", { name: "Product name 1", exact: true }).fill("Validation item");
  await dialog.getByRole("spinbutton", { name: "Unit cost 1 (PHP)", exact: true }).fill("2.55");
  await dialog.getByRole("textbox", { name: "Selling price 1 (PHP)", exact: true }).fill("2.54");
  await expect(dialog.getByText("Selling price cannot be lower than unit cost.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Apply suggested price 1", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Selling price 1 (PHP)", exact: true })).toHaveValue("3.32");
  await dialog.getByRole("textbox", { name: "Selling price 1 (PHP)", exact: true }).fill("5.00");
  await dialog.getByRole("spinbutton", { name: "Markup 1 (%)", exact: true }).fill("50");
  await expect(dialog.getByRole("textbox", { name: "Selling price 1 (PHP)", exact: true })).toHaveValue("5.00");
  await dialog.getByRole("button", { name: "Apply suggested price 1", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Selling price 1 (PHP)", exact: true })).toHaveValue("3.83");
  await dialog.locator("details summary").first().click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.getByRole("button", { name: "Apply suggested price 1", exact: true }).scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/invoice-markup-${width}.png`, fullPage: true });
  }
  await expect(dialog.getByRole("button", { name: "Save received purchase", exact: true })).toBeDisabled();
});

test("invoice barcodes cannot be repeated across new products", async ({ page, context }) => {
  page.setDefaultTimeout(15000);
  await openGuestPreview(page, context);
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "Import Receipt / Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const index of [1, 2]) {
    await dialog.getByRole("button", { name: "Add product", exact: true }).click();
    await dialog.getByRole("combobox", { name: `Product match ${index}`, exact: true }).selectOption("new");
    await dialog.locator("details summary").nth(index - 1).click();
    await dialog.getByRole("textbox", { name: `Product name ${index}`, exact: true }).fill(`Different new item ${index}`);
    await dialog.getByRole("textbox", { name: `Supplier product code ${index}`, exact: true }).fill(index === 1 ? "001-AB" : "001 \u2013 ab");
  }
  await expect(dialog.getByRole("alert")).toContainText("Repeated barcode");
  await expect(dialog.getByRole("button", { name: "Save received purchase", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Supplier product code 2", exact: true }).fill("002-AB");
  await expect(dialog.getByText(/^Repeated barcode/)).toHaveCount(0);
});

test("all guest modules and read APIs work with an unreachable database and show only demo records", async ({ page, context }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "View as guest", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const banner = "Viewing as Guest. All modules are read-only and show mock data. No live business records are displayed. Try the forms and invoice OCR; saving, updating and confirmations are disabled.";
  await expect(page.getByText(banner)).toBeVisible();
  for (const path of ["/dashboard", "/sales", "/customers", "/inventory/products", "/inventory/movements", "/purchasing", "/suppliers", "/finance/ledger", "/reports/sales", "/reports/purchases", "/reports/inventory", "/settings/users", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(banner)).toBeVisible();
    await expect(page.getByText("Unable to load this page")).toHaveCount(0);
  }
  for (const path of ["/customers/930001", "/suppliers/940001", "/inventory/products/920001", "/sales/900001", "/purchasing/910001"]) {
    await page.goto(path);
    await expect(page.getByText(banner)).toBeVisible();
    await expect(page.getByText("Unable to load this page")).toHaveCount(0);
    await expect(page.getByText(/Demo /).first()).toBeVisible();
  }
  for (const path of ["/sales/new", "/purchasing/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^Create pending/ })).toBeDisabled();
  }
  for (const path of ["/api/products", "/api/customers", "/api/suppliers", "/api/orders", "/api/purchases", "/api/users", "/api/products/920001", "/api/customers/930001", "/api/suppliers/940001"]) {
    const response = await context.request.get(path);
    expect(response.status()).toBe(200);
    expect(JSON.stringify(await response.json())).toContain("Demo ");
  }
  for (const path of ["/api/products/1", "/api/customers/1", "/api/suppliers/1"]) expect((await context.request.get(path)).status()).toBe(404);
  for (const path of ["/customers/1", "/suppliers/1", "/sales/1", "/purchasing/1", "/inventory/products/1"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  }
  for (const [method, path] of [["post", "/api/products"], ["patch", "/api/products/1"], ["post", "/api/customers"], ["patch", "/api/customers/1"], ["post", "/api/suppliers"], ["patch", "/api/suppliers/1"], ["post", "/api/orders"], ["patch", "/api/orders/1"], ["post", "/api/purchases"], ["post", "/api/purchases/import"], ["patch", "/api/purchases/1"], ["post", "/api/inventory/adjustments"], ["post", "/api/users"], ["patch", "/api/users/1"], ["post", "/api/auth/password"]]) {
    const response = await context.request[method](path, { headers: { Origin: "http://localhost:3301" }, data: {} });
    expect(response.status()).toBe(403);
  }
  await page.goto("/inventory/products");
  await page.getByRole("searchbox", { name: "Search products", exact: true }).last().fill("Demo Notebook");
  await expect(page.getByRole("gridcell", { name: "Demo Notebook", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/guest-mock-products.png", fullPage: true });
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Account: Guest", exact: true }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
