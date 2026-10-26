import GuestPreviewProvider from "@/components/ui/GuestPreviewProvider";
import Sidebar from "@/components/layout/Sidebar";
import AppHeader from "@/components/layout/AppHeader";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import GuestBanner from "@/components/layout/GuestBanner";
export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <GuestPreviewProvider guest={user.role === "GUEST"}><div className="min-h-screen bg-[#f7f8fc] text-slate-900 dark:bg-[#101010] dark:text-[#f5f5f5] lg:flex"><Sidebar role={user.role} /><div className="min-w-0 flex-1"><AppHeader user={user} /><main className="min-w-0 p-3 sm:p-5 lg:p-8">{user.role === "GUEST" && <GuestBanner />}{children}</main></div></div></GuestPreviewProvider>;
}
