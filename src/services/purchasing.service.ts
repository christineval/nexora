import "server-only";
import { listTransactions } from "./transaction.service";
import { prisma } from "@/lib/prisma";
import type { PurchaseRow } from "@/types/views";
export async function listPurchases(): Promise<PurchaseRow[]> {
  const purchases = await prisma.purchase_orders.findMany({
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
export async function getPurchase(id: string) { return (await listTransactions("purchasing")).find(row => row.id === id) ?? null; }
