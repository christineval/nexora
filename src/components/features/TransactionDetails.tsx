import RecordDetails from "@/components/ui/RecordDetails";
import Table from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { TransactionRow } from "@/types/features";
import { fromMinorUnits, sumMoney, toMinorUnits } from "@/lib/money";
export default function TransactionDetails({ row }: { row: TransactionRow }) {
  const paid = sumMoney((row.payments ?? []).map(payment => payment.amount));
  const balance = fromMinorUnits(toMinorUnits(row.total) - toMinorUnits(paid));
  return <><RecordDetails fields={[["Reference", "#" + row.id], ["Customer / supplier", row.party], ["Date", formatDateTime(row.timestamp)], ["Status", <StatusBadge key="status" value={row.status} />], ["Created by", row.createdBy], ["Total", formatCurrency(Number(row.total))], ...(row.payments !== undefined ? [["Paid in cash", formatCurrency(Number(paid))], [row.status === "RECEIVED" ? "Outstanding balance" : "Planned amount (not yet payable)", formatCurrency(Number(balance))]] as [string, string][] : [])]} /><Table headers={["Product", "Quantity", "Unit Price", "Line Total"]} rows={row.items.map(item => ({ id: item.id, cells: [item.name, item.quantity, formatCurrency(Number(item.unitPrice)), formatCurrency(Number(item.lineTotal))] }))} />{row.payments !== undefined && <div className="mt-5 space-y-3"><h3 className="font-semibold">Cash payment history</h3>{row.payments.length ? <Table headers={["Payment #", "Date", "Amount", "Reference"]} rows={row.payments.map(payment => ({ id: payment.id, cells: ["#" + payment.id, payment.date, formatCurrency(Number(payment.amount)), payment.reference || "No reference"] }))} /> : <p className="text-sm text-slate-500 dark:text-neutral-400">No cash payments recorded. Received purchases remain payable until payments are recorded.</p>}</div>}</>;
}
