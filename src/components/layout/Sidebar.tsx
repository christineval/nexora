"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccess, type Module } from "@/lib/access";
import { Box, ChartNoAxesCombined, ClipboardList, FileChartColumn, LayoutDashboard, Package, Settings, ShoppingBag, Truck, Users, Wallet, type LucideIcon } from "lucide-react";

type NavigationItem = { href: string; label: string; icon: LucideIcon };
const groups: { label: string; items: NavigationItem[] }[] = [
  { label: "Sales", items: [{ href: "/sales", label: "Sales Orders", icon: ShoppingBag }, { href: "/customers", label: "Customers", icon: Users }] },
  { label: "Inventory", items: [{ href: "/inventory/products", label: "Products", icon: Package }, { href: "/inventory/movements", label: "Stock Movements", icon: ClipboardList }] },
  { label: "Purchasing", items: [{ href: "/purchasing", label: "Purchase Orders", icon: ClipboardList }, { href: "/suppliers", label: "Suppliers", icon: Truck }] },
  { label: "Finance", items: [{ href: "/finance/ledger", label: "General Ledger", icon: Wallet }] },
  { label: "Reports", items: [{ href: "/reports/sales", label: "Sales Reports", icon: FileChartColumn }, { href: "/reports/purchases", label: "Purchase Reports", icon: FileChartColumn }, { href: "/reports/inventory", label: "Inventory Reports", icon: ChartNoAxesCombined }] },
  { label: "Administration", items: [{ href: "/settings/users", label: "Users", icon: Users }, { href: "/settings/audit", label: "Audit Log", icon: ClipboardList }, { href: "/settings", label: "Settings", icon: Settings }] },
];

export default function Sidebar({ mobile = false, onNavigate, role }: { mobile?: boolean; onNavigate?: () => void; role?: string }) {
  const pathname = usePathname();
  function renderItem({ href, label, icon: Icon }: NavigationItem) {
    const active = href === "/settings" ? pathname === href : pathname === href || pathname.startsWith(href + "/") || (href === "/inventory/products" && pathname === "/inventory");
    return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={"flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 motion-reduce:transition-none " + (active ? "bg-gray-200 text-black font-bold shadow-sm dark:bg-[#191919] dark:text-white" : "text-black hover:bg-gray-200 hover:text-black dark:text-[#f5f5f5] dark:hover:bg-[#191919] dark:hover:text-[#f5f5f5]")}>
      <Icon aria-hidden="true" className="size-[17px] shrink-0" /><span>{label}</span>
    </Link>;
  }
  return <aside className={"sidebar-scroll bg-white text-black dark:bg-[#101010] dark:text-[#f5f5f5] " + (mobile ? "h-full w-full overflow-y-auto overscroll-contain" : "hidden border-r border-slate-200 dark:border-[#303030] lg:sticky lg:top-0 lg:block lg:h-svh lg:w-56 lg:shrink-0 lg:overflow-y-auto xl:w-60")}>
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-6 py-6 text-base font-bold tracking-tight"><span className="flex size-7 items-center justify-center rounded-lg bg-violet-600 text-white shadow-md shadow-violet-950/30"><Box className="size-4" aria-hidden="true" /></span>Nexora</Link>
    <nav aria-label="Main navigation" className="grid gap-4 px-3 pb-5">
      <div>{renderItem({ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard })}</div>
      {groups.filter(group => !role || canAccess(role, (group.label === "Administration" ? "settings" : group.label.toLowerCase()) as Module)).map((group) => <div key={group.label}><p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[1.2px] dark:text-white uppercase">{group.label}</p><div className="space-y-0.5">{group.items.filter(item => item.href !== "/settings/audit" || role === "ADMIN").map(renderItem)}</div></div>)}
    </nav>
  </aside>;
}
