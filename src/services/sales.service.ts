import "server-only";
import { listTransactions } from "./transaction.service";
import { prisma } from "@/lib/prisma";
import type { SalesRow } from "@/types/views";
export async function listOrders(): Promise<SalesRow[]> {
  const items = await prisma.order_items.findMany({
    include: { products: true, orders: { include: { customers: true } } },
    orderBy: [{ orders: { order_date: "desc" } }, { id: "desc" }],
  });
  return items.map((item) => ({
    id: item.id.toString(), salesId: item.order_id.toString(), name: item.products.name,
    customer: item.orders.customers.name, size: item.products.size, qty: item.quantity,
    timestamp: item.orders.order_date.toISOString(), sellingPrice: item.unit_price.toNumber(),
    totalAmount: item.line_total.toNumber(), status: item.orders.status,
  }));
}
export async function getOrder(id: string) { return (await listTransactions("sales")).find(row => row.id === id) ?? null; }
