"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import HeaderDropdown from "@/components/layout/HeaderDropdown";
import type { CurrentUser } from "@/lib/auth";

const roleLabels: Record<string, string> = { ADMIN: "Administrator", SALES: "Sales", INVENTORY: "Inventory", FINANCE: "Finance", GUEST: "Read-only guest" };

export default function UserMenu({ user }: { user: Pick<CurrentUser, "name" | "role"> | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!user) return <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-violet-400 dark:hover:bg-violet-950">Sign in</Link>;
  const initials = user.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  async function logout() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out failed.");
      router.replace("/login"); router.refresh();
    } catch { setError("Please try logging out again."); }
    finally { setSaving(false); }
  }

  return <HeaderDropdown label={"Account: " + user.name} buttonClassName="flex min-w-0 items-center gap-2 p-1 text-left hover:bg-slate-50 sm:gap-3 dark:hover:bg-neutral-800" trigger={<>
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white">{initials || "U"}</span>
    <span className="hidden min-w-0 sm:block"><span className="block max-w-40 truncate text-sm font-semibold">{user.name}</span><span className="block text-xs text-slate-500 dark:text-neutral-400">{roleLabels[user.role] ?? user.role}</span></span>
    <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
  </>}>
    <div className="border-b border-slate-100 px-3 py-2 dark:border-neutral-700"><p className="truncate text-sm font-semibold">{user.name}</p><p className="text-xs text-slate-500 dark:text-neutral-400">{roleLabels[user.role] ?? user.role}</p></div>
    <button type="button" disabled={saving} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-50 dark:hover:bg-violet-950" onClick={() => void logout()}><LogOut aria-hidden="true" className="size-4" />{saving ? "Logging out..." : "Log out"}</button>
    {error && <p role="alert" className="px-3 py-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
  </HeaderDropdown>;
}
