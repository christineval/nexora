"use client";
import { useState } from "react";
import { Eye, MoreVertical, Plus } from "lucide-react";
import FeatureHeading from "@/components/ui/FeatureHeading";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import Modal from "@/components/ui/Modal";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import useMutation from "@/components/ui/use-mutation";
import StatusBadge from "@/components/ui/StatusBadge";
import TransactionDetails from "./TransactionDetails";
import TransactionForm from "./TransactionForm";
import PurchaseImport from "./PurchaseImport";
import { iconButton, primaryButton, secondaryButton } from "@/components/ui/feature-styles";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { ContactRow, TransactionRow } from "@/types/features";
import type { ProductRow } from "@/types/views";
export default function TransactionManager({ kind, rows, parties, products, initialId, initialCreate = false, canEdit = true }: { kind: "sales" | "purchasing"; rows: TransactionRow[]; parties: ContactRow[]; products: ProductRow[]; initialId?: string; initialCreate?: boolean; canEdit?: boolean }) {
  const sales = kind === "sales";
  const title = sales ? "Sales Orders" : "Purchase Orders";
  const endpoint = sales ? "orders" : "purchases";
  const [panel, setPanelState] = useState<{ kind: "create" | "edit" | "details" | "actions"; id?: string } | null>(initialId ? { kind: "details", id: initialId } : initialCreate && canEdit ? { kind: "create" } : null);
  const [action, setAction] = useState("");
  const { notify } = useNotifications();
  const mutation = useMutation();
  function setPanel(nextPanel: typeof panel) { mutation.clearError(); setPanelState(nextPanel); }
  const row = rows.find(row => row.id === panel?.id);
  function open(kind: "actions" | "details", id: string) { setAction(""); setPanel({ kind, id }); }
  const columns: FeatureColumn<TransactionRow>[] = [
    { field: "reference", label: sales ? "Order #" : "PO #", width: 110, value: row => "#" + row.id, render: row => <button type="button" className="font-medium text-violet-600 dark:text-violet-400" onClick={() => open("details", row.id)}>#{row.id}</button> },
    { field: "party", label: sales ? "Customer" : "Supplier", width: 220, value: row => row.party },
    { field: "date", label: "Date", width: 230, value: row => formatDateTime(row.timestamp) },
    { field: "items", label: "Items", width: 80, value: row => row.items.length },
    { field: "total", label: "Total Amount", width: 150, value: row => Number(row.total), render: row => formatCurrency(Number(row.total)) },
    { field: "status", label: "Status", width: 125, value: row => row.status, render: row => <StatusBadge value={row.status} /> },
  ];
  return <section><FeatureHeading title={title} description={sales ? "Manage and track customer orders" : "Manage supplier purchase orders"}>{canEdit && <div className="flex flex-wrap gap-2">{!sales && <PurchaseImport parties={parties} products={products} />}<button type="button" className={primaryButton} onClick={() => setPanel({ kind: "create" })}><Plus className="size-4" />{sales ? "New Order" : "New Purchase Order"}</button></div>}</FeatureHeading>
    
    <FeatureTable rows={rows} columns={columns} label={title} statusValue={row => row.status} timestamp={row => row.timestamp} searchText={row => [row.id, row.party, ...row.items.map(item => item.name + " " + item.sku)].join(" ")} actions={row => <><button className={iconButton} type="button" aria-label={"View order " + row.id} onClick={() => open("details", row.id)}><Eye className="size-4" /></button>{canEdit && <button className={iconButton} type="button" aria-label={"Actions for order " + row.id} onClick={() => open("actions", row.id)}><MoreVertical className="size-4" /></button>}</>} />
    <Modal key={panel?.kind + (panel?.id ?? "")} open={!!panel} busy={mutation.saving} wide title={panel?.kind === "edit" ? "Edit pending order" : panel?.kind === "create" ? (sales ? "Create Sales Order" : "Create Purchase Order") : (panel?.kind === "actions" ? "Order actions" : "Order details")} onClose={() => { setPanel(null); setAction(""); }}>
      
      {canEdit && (panel?.kind === "create" || panel?.kind === "edit") && <TransactionForm initialRow={panel.kind === "edit" ? row : undefined} kind={kind} parties={parties} products={products} saving={mutation.saving} onSubmit={data => void mutation.submit("/api/" + endpoint + (panel.kind === "edit" ? "/" + row?.id : ""), panel.kind === "edit" ? "PATCH" : "POST", panel.kind === "edit" ? { ...data, action: "edit" } : data, () => { setPanel(null); notify("Pending order saved successfully."); })} />}
      {row && (panel?.kind === "details" || panel?.kind === "actions") && <TransactionDetails row={row} />}
      {canEdit && row && panel?.kind === "actions" && <div className="mt-5 space-y-4">
        {!action && <div className="flex flex-wrap gap-3">{row.status === "PENDING" && <button type="button" className={secondaryButton} onClick={() => setPanel({ kind: "edit", id: row.id })}>Edit pending order</button>}{row.status === "PENDING" && <button type="button" className={primaryButton} onClick={() => setAction("confirm")}>{sales ? "Confirm order" : "Mark as ordered"}</button>}{row.status === (sales ? "CONFIRMED" : "ORDERED") && <button type="button" className={primaryButton} onClick={() => setAction("complete")}>{sales ? "Complete sale" : "Receive purchase"}</button>}{["PENDING", sales ? "CONFIRMED" : "ORDERED"].includes(row.status) && <button type="button" className={secondaryButton} onClick={() => setAction("cancel")}>Cancel order</button>}{["COMPLETED", "RECEIVED", "CANCELLED"].includes(row.status) && <p className="text-sm text-slate-500 dark:text-neutral-400">This order is final. Its audit history is retained.</p>}</div>}
        {action && <div className="rounded-lg border border-amber-200 p-4 dark:border-amber-900"><p className="mb-4 text-sm">{action === "complete" ? (sales ? "Complete this cash sale? Stock will decrease and balanced cash / revenue entries will be posted." : "Receive this purchase? Stock will increase and balanced inventory / payable entries will be posted.") : action === "cancel" ? "Cancel this order? It will remain in history and cannot be reopened." : "Confirm this order for processing?"}</p><div className="flex gap-3"><button type="button" disabled={mutation.saving} className={primaryButton} onClick={() => void mutation.submit("/api/" + endpoint + "/" + row.id, "PATCH", { action }, () => { setPanel(null); setAction(""); notify("Order updated successfully."); })}>{mutation.saving ? "Processing..." : "Confirm"}</button><button type="button" className={secondaryButton} disabled={mutation.saving} onClick={() => setAction("")}>Go back</button></div></div>}
      </div>}
    </Modal>
  </section>;
}
