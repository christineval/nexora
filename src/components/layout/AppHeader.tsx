import { Search } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import UserMenu from "@/components/layout/UserMenu";
import NotificationBell from "@/components/layout/NotificationBell";
import MobileNavigation from "@/components/layout/MobileNavigation";
import type { CurrentUser } from "@/lib/auth";

export default function AppHeader({ user }: { user: CurrentUser | null }) {
  return <header className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-white px-3 py-3 dark:border-[#303030] dark:bg-[#191919] sm:gap-3 sm:px-5 lg:px-8">
    <MobileNavigation role={user?.role} />
    <form action="/inventory/products" className="relative order-last w-full sm:order-none sm:mr-auto sm:w-auto sm:min-w-0 sm:flex-1 lg:max-w-sm">
      <label htmlFor="workspace-search" className="sr-only">Search products</label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input id="workspace-search" name="q" type="search" placeholder="Search products…" className="h-9 w-full rounded-lg border border-transparent bg-slate-100/80 pr-3 pl-9 text-sm outline-none placeholder:text-slate-400 focus:border-violet-400 dark:bg-[#111111] dark:placeholder:text-neutral-500" />
    </form>
    <div className="ml-auto flex items-center gap-2"><ThemeToggle /><NotificationBell /></div>
    <div className="border-l border-slate-200 pl-3 dark:border-neutral-700"><UserMenu user={user} /></div>
  </header>;
}
