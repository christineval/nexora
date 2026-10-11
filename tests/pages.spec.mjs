import { test, expect } from "@playwright/test";
import { sessionFor } from "./test-session.mjs";

test.beforeEach(async ({ context }) => { await context.addCookies([await sessionFor("ADMIN")]); });

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
    const product = dialog.getByRole("combobox", { name: "Product 1 *", exact: true });
    const quantity = dialog.getByRole("spinbutton", { name: "Quantity *", exact: true });
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
  await dialog.getByLabel("Name *", { exact: true }).fill("Snackbar test");
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

test("sidebar hides its scrollbar while lower navigation remains reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto("/customers");
  const sidebar = page.locator("aside.sidebar-scroll:visible");
  const scroll = await sidebar.evaluate(element => ({
    scrollbar: getComputedStyle(element).scrollbarWidth,
    overflow: getComputedStyle(element).overflowY,
    scrollable: element.scrollHeight > element.clientHeight,
  }));
  expect(scroll).toEqual({ scrollbar: "none", overflow: "auto", scrollable: true });
  await sidebar.getByRole("link", { name: "Settings", exact: true }).scrollIntoViewIfNeeded();
  expect(await sidebar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("feature pages load database data and open creation, editing and detail modals", async ({ page }) => {
  for (const [path, heading, add, dialog] of [["/customers", "Customers", "Add Customer", "Add customer"], ["/suppliers", "Suppliers", "Add Supplier", "Add supplier"], ["/sales", "Sales Orders", "New Order", "Create Sales Order"], ["/purchasing", "Purchase Orders", "New Purchase Order", "Create Purchase Order"], ["/settings/users", "Users", "Add User", "Add user"]]) {
    await page.goto(path); await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("button", { name: add, exact: true }).click();
    await expect(page.getByRole("dialog", { name: dialog, exact: true })).toBeVisible();
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
  await expect(page.getByText("Viewing as Guest. All modules are read-only.")).toBeVisible();
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
