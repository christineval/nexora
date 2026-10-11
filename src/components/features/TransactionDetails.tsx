import RecordDetails from "@/components/ui/RecordDetails";
import Table from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { TransactionRow } from "@/types/features";
export default function TransactionDetails({ row }: { row: TransactionRow }) {
  return <><RecordDetails fields={[["Reference", "#" + row.id], ["Customer / supplier", row.party], ["Date", formatDateTime(row.timestamp)], ["Status", <StatusBadge key="status" value={row.status} />], ["Created by", row.createdBy], ["Total", formatCurrency(Number(row.total))]]} /><Table headers={["Product", "Quantity", "Unit Price", "Line Total"]} rows={row.items.map(item => ({ id: item.id, cells: [item.name, item.quantity, formatCurrency(Number(item.unitPrice)), formatCurrency(Number(item.lineTotal))] }))} /></>;
}
