import Sidebar from "@/components/layout/Sidebar";
import AppHeader from "@/components/layout/AppHeader";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen bg-[#f7f8fc] text-slate-900 dark:bg-[#101010] dark:text-[#f5f5f5] lg:flex"><Sidebar role={user.role} /><div className="min-w-0 flex-1"><AppHeader user={user} /><main className="min-w-0 p-3 sm:p-5 lg:p-8">{user.role === "GUEST" && <p className="mb-5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">Viewing as Guest. All modules are read-only and show mock data. No live business records are displayed.</p>}{children}</main></div></div>;
}
