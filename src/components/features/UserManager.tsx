"use client";
import { useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import FeatureHeading from "@/components/ui/FeatureHeading";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import Modal from "@/components/ui/Modal";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import RecordDetails from "@/components/ui/RecordDetails";
import useMutation from "@/components/ui/use-mutation";
import { control, iconButton, primaryButton } from "@/components/ui/feature-styles";
import { roles } from "@/lib/access";
import { formatDateTime } from "@/lib/utils";
import type { UserRow } from "@/types/features";
export default function UserManager({ rows, currentId, canEdit = true }: { rows: UserRow[]; currentId: string; canEdit?: boolean }) {
  const [panel, setPanelState] = useState<{ kind: "create" | "edit" | "details"; id?: string } | null>(null);
  const { notify } = useNotifications();
  const mutation = useMutation();
  function setPanel(nextPanel: typeof panel) { mutation.clearError(); setPanelState(nextPanel); }
  const row = rows.find(row => row.id === panel?.id);
  const columns: FeatureColumn<UserRow>[] = [{ field: "name", label: "Name", width: 220, value: row => row.name }, { field: "email", label: "Email", width: 300, value: row => row.email }, { field: "role", label: "Role", width: 160, value: row => row.role }, { field: "created", label: "Created", width: 230, value: row => formatDateTime(row.timestamp) }];
  return <section><FeatureHeading title="Users" description="Manage workspace users and module access">{canEdit && <button type="button" className={primaryButton} onClick={() => setPanel({ kind: "create" })}><Plus className="size-4" />Add User</button>}</FeatureHeading><FeatureTable rows={rows} columns={columns} label="Users" statusValue={row => row.role} searchText={row => row.name + " " + row.email} actions={row => <>{canEdit && <button type="button" className={iconButton} aria-label={"Edit " + row.name} onClick={() => setPanel({ kind: "edit", id: row.id })}><Pencil className="size-4" /></button>}<button type="button" className={iconButton} aria-label={"Details for " + row.name} onClick={() => setPanel({ kind: "details", id: row.id })}><Eye className="size-4" /></button></>} />
    <Modal key={panel?.kind + (panel?.id ?? "")} open={!!panel} busy={mutation.saving} title={panel?.kind === "create" ? "Add user" : panel?.kind === "edit" ? "Edit user" : "User details"} onClose={() => setPanel(null)}>
      {panel?.kind === "details" && row && <RecordDetails fields={[["Name", row.name], ["Email", row.email], ["Role", row.role], ["Created", formatDateTime(row.timestamp)]]} />}
      {canEdit && panel && panel.kind !== "details" && <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void mutation.submit("/api/users" + (row ? "/" + row.id : ""), row ? "PATCH" : "POST", Object.fromEntries(new FormData(event.currentTarget)), () => { setPanel(null); notify("User saved successfully."); }); }}><fieldset disabled={mutation.saving} className="grid gap-4"><label className="grid gap-1.5 text-sm">Name *<input className={control} name="name" required maxLength={100} defaultValue={row?.name} /></label><label className="grid gap-1.5 text-sm">Email *<input type="email" className={control} name="email" required maxLength={255} defaultValue={row?.email} /></label><label className="grid gap-1.5 text-sm">Role *<select className={control} name="role" defaultValue={row?.role ?? "SALES"}>{roles.filter(role => row?.id !== currentId || role === "ADMIN").map(role => <option key={role}>{role}</option>)}</select></label>{!row && <label className="grid gap-1.5 text-sm">Initial password *<input className={control} name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /><span className="text-xs text-slate-500">At least 12 characters. Share securely with this user.</span></label>}</fieldset><div className="flex justify-end"><button className={primaryButton} disabled={mutation.saving}>{mutation.saving ? "Saving..." : "Save user"}</button></div></form>}
    </Modal>
  </section>;
}
