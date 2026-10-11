import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatCurrency } from "@/lib/utils";
import type { RecentOrder } from "@/types/views";

const iconColors = [
  "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  "bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300",
  "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/40 dark:text-fuchsia-400",
  "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
];

export default function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return <Card className="flex h-[400px] flex-col rounded-2xl" aria-labelledby="recent-orders-heading">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 id="recent-orders-heading" className="text-lg font-semibold">Recent Orders</h3>
      <Link href="/sales" className="shrink-0 rounded text-xs font-semibold text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500 dark:text-emerald-400">View All<span className="sr-only"> sales orders</span></Link>
    </div>
    {orders.length ? <ul className="flex min-h-0 flex-1 flex-col divide-y divide-gray-100 dark:divide-neutral-800">
      {orders.map((order, index) => <li key={order.id} className="flex min-h-0 flex-1">
        <Link href={"/sales/" + order.id} aria-label={"View order #" + order.id + " for " + order.customer} className="flex w-full items-center gap-3 rounded-lg py-3 focus-visible:outline-2 focus-visible:outline-violet-500 hover:bg-slate-50 dark:hover:bg-neutral-800/50">
          <span className={"flex size-10 shrink-0 items-center justify-center rounded-xl " + iconColors[index % iconColors.length]}><ShoppingBag aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold" title={"#" + order.id}>#{order.id}</p><p className="mt-1 truncate text-xs text-slate-500 dark:text-neutral-400" title={order.customer}>{order.customer}</p></div>
          <div className="shrink-0 text-right"><p className={"mb-1 text-sm font-bold " + (order.status === "COMPLETED" ? "text-emerald-700 dark:text-emerald-400" : "")}>{formatCurrency(order.totalAmount)}</p><StatusBadge value={order.status} /></div>
        </Link>
      </li>)}
    </ul> : <p className="flex flex-1 items-center justify-center text-sm text-slate-500 dark:text-neutral-400">No sales orders yet.</p>}
  </Card>;
}
