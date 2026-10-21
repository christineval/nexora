"use client";
import FormLabel from "@/components/ui/FormLabel";
import { useState } from "react";
import { canWrite } from "@/lib/access";
import FeatureHeading from "@/components/ui/FeatureHeading";
import Modal from "@/components/ui/Modal";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import RecordDetails from "@/components/ui/RecordDetails";
import ThemeToggle from "@/components/layout/ThemeToggle";
import useMutation from "@/components/ui/use-mutation";
import { control, primaryButton, secondaryButton } from "@/components/ui/feature-styles";
export default function SettingsPanel({ user }: { user: { name: string; role: string } }) {
  const canEdit = canWrite(user.role, "settings");
  const [open, setOpen] = useState(false);
  const { notify } = useNotifications();
  const mutation = useMutation();
  return <section><FeatureHeading title="Settings" description="Workspace preferences and account security" /><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-neutral-700 dark:bg-[#191919]"><h2 className="font-semibold">Your account</h2><RecordDetails fields={[["Name", user.name], ["Role", user.role]]} />{canEdit && <button type="button" className={secondaryButton} onClick={() => setOpen(true)}>Change password</button>}</div><div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-neutral-700 dark:bg-[#191919]"><h2 className="mb-4 font-semibold">Appearance</h2><p className="mb-4 text-sm text-slate-500 dark:text-neutral-400">Theme preference is saved on this browser.</p><ThemeToggle /><RecordDetails fields={[["Currency", "Philippine Peso (PHP)"], ["Timezone", "Asia/Manila"], ["Sales tax", "0 — tax-free sales"], ["Purchase receipt", "Inventory / Accounts Payable"]]} /></div></div><Modal key={open ? "open" : "closed"} open={canEdit && open} busy={mutation.saving} title="Change password" onClose={() => setOpen(false)}><form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void mutation.submit("/api/auth/password", "POST", Object.fromEntries(new FormData(event.currentTarget)), () => { setOpen(false); notify("Password updated. Other sessions have been signed out."); }); }}><FormLabel label="Current password" required className="grid gap-1.5 text-sm"><input name="currentPassword" type="password" required autoComplete="current-password" className={control} /></FormLabel><FormLabel label="New password" required className="grid gap-1.5 text-sm"><input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className={control} /></FormLabel><FormLabel label="Confirm new password" required className="grid gap-1.5 text-sm"><input name="confirmPassword" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className={control} /></FormLabel><button type="submit" disabled={mutation.saving} className={primaryButton}>{mutation.saving ? "Updating..." : "Update password"}</button></form></Modal></section>;
}
