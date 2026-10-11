"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import FeatureHeading from "@/components/ui/FeatureHeading";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import RecordDetails from "@/components/ui/RecordDetails";
import MetricCards from "./MetricCards";
import { control, iconButton } from "@/components/ui/feature-styles";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { fromMinorUnits, sumMoney, toMinorUnits } from "@/lib/money";
import type { LedgerRow } from "@/types/features";
export default function LedgerManager({ rows }: { rows: LedgerRow[] }) {
  const [account, setAccount] = useState("");
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const columns: FeatureColumn<LedgerRow>[] = [
    { field: "date", label: "Date", width: 220, value: row => formatDateTime(row.timestamp) },
    { field: "account", label: "Account", width: 190, value: row => row.account },
    { field: "type", label: "Type", width: 100, value: row => row.type, render: row => <StatusBadge value={row.type} /> },
    { field: "amount", label: "Amount", width: 150, value: row => Number(row.amount), render: row => formatCurrency(Number(row.amount)) },
    { field: "reference", label: "Reference", width: 190, value: row => row.reference },
    { field: "description", label: "Description", width: 260, value: row => row.description ?? "—" },
  ];
  return <section><FeatureHeading title="Ledger Entries" description="View financial transactions and their business references" /><label className="mb-4 grid max-w-xs gap-1.5 text-xs text-slate-500 dark:text-neutral-400">Account<select value={account} onChange={event => setAccount(event.target.value)} className={control}><option value="">All accounts</option>{[...new Set(rows.map(row => row.account))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
    <FeatureTable key={account} rows={rows.filter(row => !account || row.account === account)} columns={columns} label="Ledger entries" searchText={row => [row.account, row.reference, row.description, row.createdBy].join(" ")} statusValue={row => row.type} timestamp={row => row.timestamp} exportable actions={row => <button type="button" className={iconButton} aria-label={"View ledger entry " + row.id} onClick={() => setSelected(row)}><Eye className="size-4" /></button>} onFiltered={filtered => {
      const debits = sumMoney(filtered.filter(row => row.type === "DEBIT").map(row => row.amount)); const credits = sumMoney(filtered.filter(row => row.type === "CREDIT").map(row => row.amount));
      return <MetricCards metrics={[{ label: "Total Debits", value: formatCurrency(Number(debits)) }, { label: "Total Credits", value: formatCurrency(Number(credits)) }, { label: "Debit less credit", value: formatCurrency(Number(fromMinorUnits(toMinorUnits(debits) - toMinorUnits(credits)))), note: "For the current filters; this is not a cash balance." }]} />;
    }} />
    <Modal open={!!selected} title="Ledger entry details" onClose={() => setSelected(null)}>{selected && <RecordDetails fields={[["Date", formatDateTime(selected.timestamp)], ["Account", selected.account], ["Type", selected.type], ["Amount", formatCurrency(Number(selected.amount))], ["Reference", selected.reference], ["Created by", selected.createdBy], ["Description", selected.description]]} />}</Modal>
  </section>;
}
