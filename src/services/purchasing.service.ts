import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { orderAccessWhere } from "@/server/order-access";
import { listTransactions } from "./transaction.service";
import { prisma } from "@/lib/prisma";
import type { PurchaseRow } from "@/types/views";
export async function listPurchases(user: CurrentUser): Promise<PurchaseRow[]> {
  const purchases = await prisma.purchase_orders.findMany({
    where: orderAccessWhere(user, "purchasing"),
    include: { suppliers: true, purchase_items: { select: { quantity: true } } },
    orderBy: { purchase_date: "desc" },
  });
  return purchases.map((purchase) => ({
    id: purchase.id.toString(), invoiceID: purchase.id.toString(), supplier: purchase.suppliers.name,
    qty: purchase.purchase_items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: purchase.total_amount.toNumber(), timestamp: purchase.purchase_date.toISOString(),
    status: purchase.status,
  }));
}
export async function getPurchase(id: string, user: CurrentUser) { return (await listTransactions("purchasing", user)).find(row => row.id === id) ?? null; }
