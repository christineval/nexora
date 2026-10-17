"use client";
import Link from "next/link";
import { useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import FeatureHeading from "@/components/ui/FeatureHeading";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import Modal from "@/components/ui/Modal";
import RecordDetails from "@/components/ui/RecordDetails";
import StatusBadge from "@/components/ui/StatusBadge";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import useMutation from "@/components/ui/use-mutation";
import { control, iconButton, primaryButton } from "@/components/ui/feature-styles";
import type { ContactRow } from "@/types/features";
import { numericInputProps } from "@/lib/numeric-input";

export default function ContactManager({ kind, rows, initialId, canEdit = true }: { kind: "customers" | "suppliers"; rows: ContactRow[]; initialId?: string; canEdit?: boolean }) {
  const singular = kind === "customers" ? "Customer" : "Supplier";
  const [panel, setPanelState] = useState<{ kind: "create" | "edit" | "details"; id?: string } | null>(initialId ? { kind: "details", id: initialId } : null);
  const { notify } = useNotifications();
  const mutation = useMutation();
  function setPanel(nextPanel: typeof panel) { mutation.clearError(); setPanelState(nextPanel); }
  const row = rows.find(row => row.id === panel?.id);
  const columns: FeatureColumn<ContactRow>[] = [
    { field: "name", label: "Name", width: 200, value: row => row.name },
    ...(kind === "suppliers" ? [{ field: "contactPerson", label: "Contact Person", value: (row: ContactRow) => row.contactPerson || "—" }] : []),
    { field: "email", label: "Email", width: 230, value: row => row.email || "—" },
    { field: "phone", label: "Phone", value: row => row.phone || "—" },
    { field: "address", label: "Address", width: 240, value: row => row.address || "—" },
    { field: "status", label: "Status", width: 110, value: row => row.status, render: row => <StatusBadge value={row.status} /> },
  ];
  return <section>
    <FeatureHeading title={singular + "s"} description={kind === "customers" ? "Manage your customer information" : "Manage supplier contacts and purchasing relationships"}>{canEdit && <button type="button" className={primaryButton} onClick={() => setPanel({ kind: "create" })}><Plus className="size-4" />Add {singular}</button>}</FeatureHeading>
    
    <FeatureTable rows={rows} columns={columns} label={singular + "s"} searchText={row => [row.name, row.email, row.phone, row.address, row.contactPerson].join(" ")} statusValue={row => row.status} actions={row => <>{canEdit && <button type="button" className={iconButton} aria-label={"Edit " + row.name} onClick={() => setPanel({ kind: "edit", id: row.id })}><Pencil className="size-4" /></button>}<button type="button" className={iconButton} aria-label={"Details for " + row.name} onClick={() => setPanel({ kind: "details", id: row.id })}><Eye className="size-4" /></button></>} />
    <Modal key={panel?.kind + (panel?.id ?? "")} open={!!panel} busy={mutation.saving} title={(panel?.kind === "create" ? "Add " : panel?.kind === "edit" ? "Edit " : "Details: ") + singular.toLowerCase()} onClose={() => setPanel(null)}>
      {panel?.kind === "details" && row && <><RecordDetails fields={[["Name", row.name], ["Email", row.email], ["Phone", row.phone], ["Address", row.address], ["Status", <StatusBadge key="status" value={row.status} />], ...(kind === "suppliers" ? [["Contact person", row.contactPerson] as [string, React.ReactNode]] : [])]} /><Link href={"/" + kind + "/" + row.id} className="text-sm font-medium text-violet-600 dark:text-violet-400">View {kind === "customers" ? "sales" : "purchase"} history →</Link></>}
      {canEdit && panel && panel.kind !== "details" && <form className="mt-5 space-y-4" onSubmit={event => {
        event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
        void mutation.submit("/api/" + kind + (row ? "/" + row.id : ""), row ? "PATCH" : "POST", data, () => { setPanel(null); notify(singular + " saved successfully."); });
      }}><fieldset disabled={mutation.saving} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">Name *<input name="name" className={control} defaultValue={row?.name} maxLength={150} required /></label>
        {kind === "suppliers" && <label className="grid gap-1.5 text-sm">Contact person<input name="contactPerson" className={control} defaultValue={row?.contactPerson ?? ""} maxLength={150} /></label>}
        <label className="grid gap-1.5 text-sm">Email<input type="email" name="email" className={control} defaultValue={row?.email ?? ""} maxLength={255} /></label>
        <label className="grid gap-1.5 text-sm">Phone<input {...(kind === "customers" ? numericInputProps() : {})} type={kind === "customers" ? "tel" : "text"} pattern={kind === "customers" ? "[0-9]*" : undefined} onChange={kind === "customers" ? event => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, ""); } : undefined} name="phone" className={control} defaultValue={row?.phone ?? ""} maxLength={30} /></label>
        <label className="grid gap-1.5 text-sm">Status<select name="status" className={control} defaultValue={row?.status ?? "ACTIVE"}><option>ACTIVE</option><option>INACTIVE</option></select></label>
        <label className="grid gap-1.5 text-sm sm:col-span-2">Address<textarea name="address" className={control + " h-20! py-2"} defaultValue={row?.address ?? ""} maxLength={2000} /></label>
      </fieldset><div className="flex justify-end"><button type="submit" disabled={mutation.saving} className={primaryButton}>{mutation.saving ? "Saving..." : "Save " + singular.toLowerCase()}</button></div></form>}
    </Modal>
  </section>;
}
