"use client";
import { useGuestPreview } from "@/components/ui/GuestPreviewProvider";
import FormLabel from "@/components/ui/FormLabel";
import { useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import FeatureHeading from "@/components/ui/FeatureHeading";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import Modal from "@/components/ui/Modal";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import RecordDetails from "@/components/ui/RecordDetails";
import useMutation from "@/components/ui/use-mutation";
import { control, iconButton, primaryButton } from "@/components/ui/feature-styles";
import { userSchema, updateUserSchema } from "@/validations/user.schema";
import { validationMessages } from "@/lib/validation-errors";
import { normalizeIdentity } from "@/lib/record-identity";
import { roles } from "@/lib/access";
import { formatDateTime } from "@/lib/utils";
import type { UserRow } from "@/types/features";
export default function UserManager({ rows, currentId, canEdit = true }: { rows: UserRow[]; currentId: string; canEdit?: boolean }) {
  const isGuest = useGuestPreview();
  const canPreview = canEdit && !isGuest;
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [panel, setPanelState] = useState<{ kind: "create" | "edit" | "details"; id?: string } | null>(null);
  const { notify } = useNotifications();
  const mutation = useMutation();
  function setPanel(nextPanel: typeof panel) { mutation.clearError(); setDuplicateEmail(false); setPanelState(nextPanel); }
  const row = rows.find(row => row.id === panel?.id);
  const columns: FeatureColumn<UserRow>[] = [{ field: "name", label: "Name", width: 220, value: row => row.name }, { field: "email", label: "Email", width: 300, value: row => row.email }, { field: "role", label: "Role", width: 160, value: row => row.role }, { field: "created", label: "Created", width: 230, value: row => formatDateTime(row.timestamp) }];
  return <section><FeatureHeading title="Users" description="Manage workspace users and module access">{canPreview && <button type="button" className={primaryButton} onClick={() => setPanel({ kind: "create" })}><Plus className="size-4" />Add User</button>}</FeatureHeading><FeatureTable rows={rows} columns={columns} label="Users" statusValue={row => row.role} searchText={row => row.name + " " + row.email} actions={row => <>{canPreview && <button type="button" className={iconButton} aria-label={"Edit " + row.name} onClick={() => setPanel({ kind: "edit", id: row.id })}><Pencil className="size-4" /></button>}<button type="button" className={iconButton} aria-label={"Details for " + row.name} onClick={() => setPanel({ kind: "details", id: row.id })}><Eye className="size-4" /></button></>} />
    <Modal key={panel?.kind + (panel?.id ?? "")} open={!!panel} busy={mutation.saving} title={panel?.kind === "create" ? "Add user" : panel?.kind === "edit" ? "Edit user" : "User details"} onClose={() => setPanel(null)}>
      {panel?.kind === "details" && row && <RecordDetails fields={[["Name", row.name], ["Email", row.email], ["Role", row.role], ["Created", formatDateTime(row.timestamp)]]} />}
      {canPreview && panel && panel.kind !== "details" && <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); if (!canEdit || isGuest) return; const result = (row ? updateUserSchema : userSchema).safeParse(Object.fromEntries(new FormData(event.currentTarget))); if (!result.success) { notify(validationMessages(result.error.issues)[0], "error"); return; } if (rows.some(user => user.id !== row?.id && normalizeIdentity(user.email) === normalizeIdentity(result.data.email))) { notify("A user with this email already exists.", "error"); return; } void mutation.submit("/api/users" + (row ? "/" + row.id : ""), row ? "PATCH" : "POST", result.data, () => { setPanel(null); notify("User saved successfully."); }); }}><fieldset disabled={mutation.saving} className="grid gap-4"><FormLabel label="Name" required className="grid gap-1.5 text-sm"><input className={control} name="name" required maxLength={100} defaultValue={row?.name} /></FormLabel><FormLabel label="Email" required className="grid gap-1.5 text-sm"><input type="email" className={control} name="email" required maxLength={255} defaultValue={row?.email} aria-invalid={duplicateEmail} onChange={event => setDuplicateEmail(rows.some(user => user.id !== row?.id && normalizeIdentity(user.email) === normalizeIdentity(event.target.value)))} />{duplicateEmail && <span role="alert" className="text-xs text-red-600 dark:text-red-400">A user with this email already exists.</span>}</FormLabel><FormLabel label="Role" required className="grid gap-1.5 text-sm"><select className={control} name="role" defaultValue={row?.role ?? "SALES"}>{roles.filter(role => row?.id !== currentId || role === "ADMIN").map(role => <option key={role}>{role}</option>)}</select></FormLabel>{!row && <FormLabel label="Initial password" required className="grid gap-1.5 text-sm"><input className={control} name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /><span className="text-xs text-slate-500">At least 12 characters. Share securely with this user.</span></FormLabel>}</fieldset><div className="flex justify-end"><button className={primaryButton} disabled={isGuest || !canEdit || duplicateEmail || mutation.saving}>{mutation.saving ? "Saving..." : "Save user"}</button></div></form>}
    </Modal>
  </section>;
}
