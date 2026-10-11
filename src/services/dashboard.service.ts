import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ChartTransaction, RecentOrder } from "@/types/views";

export async function getDashboardMetrics({ includeRecentOrders = false } = {}) {
  return prisma.$transaction(async (tx) => {
    const totalItems = await tx.products.count();
    const lowStockItems = await tx.products.count({ where: { status: "ACTIVE", stock_qty: { lte: 10 } } });
    const sales = await tx.orders.findMany({ where: { status: "COMPLETED" }, select: { order_date: true, total_amount: true } });
    const purchases = await tx.purchase_orders.findMany({ where: { status: "RECEIVED" }, select: { purchase_date: true, total_amount: true } });
    const orders = includeRecentOrders ? await tx.orders.findMany({
      select: { id: true, total_amount: true, status: true, customers: { select: { name: true } } },
      orderBy: [{ order_date: "desc" }, { id: "desc" }],
      take: 4,
    }) : [];
    const recentOrders: RecentOrder[] = orders.map(order => ({
      id: order.id.toString(), customer: order.customers.name,
      totalAmount: order.total_amount.toNumber(), status: order.status,
    }));
    const transactions: ChartTransaction[] = [
      ...sales.map((sale) => ({ timestamp: sale.order_date.toISOString(), amount: sale.total_amount.toNumber(), type: "sales" as const })),
      ...purchases.map((purchase) => ({ timestamp: purchase.purchase_date.toISOString(), amount: purchase.total_amount.toNumber(), type: "purchase" as const })),
    ];
    return { totalItems, lowStockItems, recentOrders, transactions,
      totalSales: sales.reduce((sum, sale) => sum + sale.total_amount.toNumber(), 0),
      totalPurchases: purchases.reduce((sum, purchase) => sum + purchase.total_amount.toNumber(), 0) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
