import { Bell } from "lucide-react";
import HeaderDropdown from "@/components/layout/HeaderDropdown";

export default function NotificationBell() {
  return <HeaderDropdown label="Notifications" buttonClassName="flex size-10 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-violet-600 dark:text-neutral-400 dark:hover:bg-neutral-800" trigger={<Bell aria-hidden="true" className="size-5" />}>
    <h2 className="px-3 py-2 text-sm font-semibold">Notifications</h2>
    <div className="px-3 py-5 text-center"><Bell aria-hidden="true" className="mx-auto mb-3 size-6 text-slate-400" /><p className="text-sm font-medium">No notifications yet</p><p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">You have no notifications to review.</p></div>
  </HeaderDropdown>;
}
