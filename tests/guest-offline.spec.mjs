import { test, expect } from "@playwright/test";

test("all guest modules and read APIs work with an unreachable database and show only demo records", async ({ page, context }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "View as guest", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const banner = "Viewing as Guest. All modules are read-only and show mock data. No live business records are displayed.";
  await expect(page.getByText(banner)).toBeVisible();
  for (const path of ["/dashboard", "/sales", "/customers", "/inventory/products", "/inventory/movements", "/purchasing", "/suppliers", "/finance/ledger", "/reports/sales", "/reports/purchases", "/reports/inventory", "/settings/users", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(banner)).toBeVisible();
    await expect(page.getByText("Unable to load this page")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Add (Product|Customer|Supplier|User)|New Order|New Purchase Order|Import Receipt|Adjust Stock|Change password|Edit |Actions for order )/ })).toHaveCount(0);
  }
  for (const path of ["/customers/930001", "/suppliers/940001", "/inventory/products/920001", "/sales/900001", "/purchasing/910001"]) {
    await page.goto(path);
    await expect(page.getByText(banner)).toBeVisible();
    await expect(page.getByText("Unable to load this page")).toHaveCount(0);
    await expect(page.getByText(/Demo /).first()).toBeVisible();
  }
  for (const path of ["/sales/new", "/purchasing/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path.replace("/new", "") + "$"));
    await expect(page.getByRole("dialog")).toHaveCount(0);
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
  for (const [method, path] of [["post", "/api/products"], ["patch", "/api/products/1"], ["post", "/api/customers"], ["patch", "/api/customers/1"], ["post", "/api/suppliers"], ["patch", "/api/suppliers/1"], ["post", "/api/orders"], ["patch", "/api/orders/1"], ["post", "/api/purchases"], ["patch", "/api/purchases/1"], ["post", "/api/inventory/adjustments"], ["post", "/api/users"], ["patch", "/api/users/1"], ["post", "/api/auth/password"]]) {
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
