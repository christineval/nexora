import Header from "@/components/layout/Header";
import { Box, TriangleAlert, CircleDollarSign, Weight } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import SalesChart from "@/components/dashboard/SalesChart";
import RecentOrders from "@/components/dashboard/RecentOrders";
import { getDashboardMetrics } from "@/server/data/erp-data";
import { formatCurrency } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canAccess } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const canViewOrders = !!user && canAccess(user.role, "sales");
  const metrics = await getDashboardMetrics(user, { includeRecentOrders: canViewOrders });
  return <div className="min-h-screen p-2">
    <Header title="Dashboard" description="Welcome to your dashboard!" />
    <div className="mt-8 grid gap-10 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Total Items" value={metrics.totalItems.toLocaleString()} bgColor="bg-blue-100" icon={<Box />} iconColor="text-blue-500" />
      <StatCard title="Low Stock Alert" value={metrics.lowStockItems.toLocaleString()} bgColor="bg-red-100" icon={<TriangleAlert />} iconColor="text-red-500" />
      <StatCard title="Total Sales" value={formatCurrency(metrics.totalSales)} bgColor="bg-green-100" icon={<CircleDollarSign />} iconColor="text-green-500" />
      <StatCard title="Total Purchases" value={formatCurrency(metrics.totalPurchases)} bgColor="bg-violet-100" icon={<Weight />} iconColor="text-violet-500" />
    </div>
    <p className="mt-4 text-xs text-gray-500 dark:text-[#aaaaaa]">Totals include completed sales and received purchases. {user.role !== "ADMIN" && user.role !== "GUEST" && "Order totals show only orders you created. "}Low stock: active products with 10 units or fewer.</p>
    <div className="grid grid-cols-12 gap-6 mt-5"><div className={"col-span-12 min-w-0 " + (canViewOrders ? "xl:col-span-8" : "")}><SalesChart transactions={metrics.transactions} /></div>
      {canViewOrders && <div className="col-span-12 min-w-0 xl:col-span-4"><RecentOrders orders={metrics.recentOrders} /></div>}
    </div>
  </div>;
}
