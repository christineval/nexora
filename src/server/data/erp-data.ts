import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { createGuestData } from "@/server/demo/guest-data";

// Select the data source from the authenticated server identity, never request input.
export async function listProducts(user: CurrentUser) {
  if (user.role === "GUEST") return createGuestData().products;
  return (await import("@/services/inventory.service")).listProducts();
}
export async function getProduct(user: CurrentUser, id: string) {
  if (user.role === "GUEST") return createGuestData().products.find(row => row.productId === id) ?? null;
  return (await import("@/services/inventory.service")).getProduct(id);
}
export async function getNextProductSku(user: CurrentUser) {
  if (user.role === "GUEST") return "";
  return (await import("@/services/inventory.service")).getNextProductSku();
}
export async function listInventoryMovements(user: CurrentUser) {
  if (user.role === "GUEST") return createGuestData().movements;
  return (await import("@/services/inventory.service")).listInventoryMovements();
}
export async function listContacts(user: CurrentUser, kind: "customers" | "suppliers") {
  if (user.role === "GUEST") return createGuestData()[kind];
  return (await import("@/services/contact.service")).listContacts(kind);
}
export async function listTransactions(user: CurrentUser, kind: "sales" | "purchasing") {
  if (user.role === "GUEST") return createGuestData()[kind === "sales" ? "sales" : "purchases"];
  return (await import("@/services/transaction.service")).listTransactions(kind, user);
}
export async function listLedgerEntries(user: CurrentUser) {
  if (user.role === "GUEST") return createGuestData().ledger;
  return (await import("@/services/finance.service")).listLedgerEntries();
}
export async function listUsers(user: CurrentUser) {
  if (user.role === "GUEST") return createGuestData().users;
  return (await import("@/services/user.service")).listUsers();
}
export async function getDashboardMetrics(user: CurrentUser, { includeRecentOrders = false } = {}) {
  if (user.role === "GUEST") {
    const metrics = createGuestData().dashboard;
    return { ...metrics, recentOrders: includeRecentOrders ? metrics.recentOrders : [] };
  }
  return (await import("@/services/dashboard.service")).getDashboardMetrics(user, { includeRecentOrders });
}
