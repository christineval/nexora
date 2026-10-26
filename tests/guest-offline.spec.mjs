import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const snapshot = JSON.parse(readFileSync(new URL("../src/server/demo/guest-snapshot.json", import.meta.url), "utf8")).data;
const firstProduct = snapshot.products.find(row => row.status === "ACTIVE");
const missingId = "9223372036854775807";

async function openGuest(page, context) {
  const issued = Date.now();
  const payload = Buffer.from(JSON.stringify({ kind: "guest", issued, expires: issued + 3600000 })).toString("base64url");
  const signature = createHmac("sha256", "guest-offline-test-signing-secret-at-least-32-characters").update(payload).digest("base64url");
  await context.addCookies([{ name: "nexora_session", value: payload + "." + signature, url: "http://localhost:3301", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/dashboard");
}

test("every guest business module is read-only with both database connections unavailable", async ({ page, context }) => {
  test.setTimeout(120000);
  const writes = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await openGuest(page, context);
  for (const path of ["/dashboard", "/sales", "/customers", "/inventory/products", "/inventory/movements", "/purchasing", "/suppliers", "/finance/ledger", "/reports/sales", "/reports/purchases", "/reports/inventory"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Guest access is for viewing only/)).toBeVisible();
    await expect(page.getByRole("link", { name: /^(Users|Settings|Audit Log)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Add (Product|Customer|Supplier|User)|New Order|New Purchase Order|Adjust Stock|Import Receipt \/ Invoice|Edit |Archive |Restore |Permanently delete|Complete sale|Receive purchase|Record cash payment)/ })).toHaveCount(0);
    await expect(page.getByText("Unable to load this page")).toHaveCount(0);
  }
  for (const [path, destination] of [["/settings", "/dashboard"], ["/settings/users", "/dashboard"], ["/settings/audit", "/dashboard"], ["/sales/new", "/sales"], ["/purchasing/new", "/purchasing"]]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(destination + "$"));
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("guest details, histories and filtering remain available without edit actions or database fallback", async ({ page, context }) => {
  test.setTimeout(90000);
  await openGuest(page, context);
  for (const path of ["/customers/" + snapshot.customers[0].id, "/suppliers/" + snapshot.suppliers[0].id, "/inventory/products/" + firstProduct.productId, "/sales/" + snapshot.sales[0].id, "/purchasing/" + snapshot.purchases[0].id]) {
    await page.goto(path);
    await expect(page.getByRole("dialog").or(page.getByRole("heading", { level: 1 })).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
    await expect(page.getByText("Unable to load this page")).toHaveCount(0);
  }
  for (const base of ["/customers/", "/suppliers/", "/sales/", "/purchasing/", "/inventory/products/"]) {
    await page.goto(base + missingId);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  }
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/inventory/products");
    await page.getByRole("searchbox", { name: "Search products", exact: true }).last().fill(firstProduct.name);
    await expect(page.getByRole("gridcell", { name: firstProduct.name, exact: true })).toBeVisible();
    await page.getByRole("grid", { name: "Product inventory" }).locator(".MuiDataGrid-virtualScroller").evaluate(node => { node.scrollLeft = node.scrollWidth; });
    await page.getByRole("button", { name: "Actions for " + firstProduct.name, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "View details", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Edit|Archive|Restore|delete/i })).toHaveCount(0);
    await page.screenshot({ path: `test-results/guest-read-only-${width}.png`, fullPage: true });
  }
});

test("guest ledger guidance is keyboard accessible and APIs retain rate limiting", async ({ page, context }) => {
  await openGuest(page, context);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/finance/ledger");
  const guide = page.getByRole("button", { name: "Ledger guide", exact: true });
  await guide.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "How the general ledger works" });
  await expect(dialog.getByRole("heading", { name: "1. Complete a cash sale" })).toBeVisible();
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(guide).toBeFocused();
  // The existing security limiter fails closed while its database is unavailable.
  expect((await context.request.get("/api/products")).status()).toBe(503);
});

test("all business date filters disable dates after today in Manila", async ({ page, context }) => {
  test.setTimeout(90000);
  await openGuest(page, context);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (const path of ["/sales", "/purchasing", "/inventory/movements", "/finance/ledger", "/reports/sales", "/reports/purchases"]) {
    await page.goto(path);
    if (path === "/inventory/movements") await page.getByText("All dates", { exact: true }).click();
    const dates = page.locator('input[type="date"]');
    expect(await dates.count(), path).toBe(2);
    for (const input of await dates.all()) {
      expect(await input.getAttribute("max")).toBe(today);
      await input.fill("2999-01-01");
      expect(await input.inputValue()).not.toBe("2999-01-01");
    }
    await dates.last().fill("2000-01-01");
    await expect(dates.first()).toHaveAttribute("max", "2000-01-01");
    await expect(dates.last()).toHaveAttribute("max", today);
  }
});
