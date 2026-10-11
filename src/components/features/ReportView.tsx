"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import FeatureHeading from "@/components/ui/FeatureHeading";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import Modal from "@/components/ui/Modal";
import TransactionDetails from "./TransactionDetails";
import MetricCards from "./MetricCards";
import { iconButton } from "@/components/ui/feature-styles";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { philippineDate } from "@/lib/feature-list";
import { fromMinorUnits, sumMoney, toMinorUnits } from "@/lib/money";
import type { TransactionRow } from "@/types/features";
export default function ReportView({ kind, rows }: { kind: "sales" | "purchases"; rows: TransactionRow[] }) {
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const columns: FeatureColumn<TransactionRow>[] = [{ field: "reference", label: "Reference", width: 120, value: row => "#" + row.id }, { field: "party", label: kind === "sales" ? "Customer" : "Supplier", width: 220, value: row => row.party }, { field: "date", label: "Date", width: 230, value: row => formatDateTime(row.timestamp) }, { field: "items", label: "Items", width: 100, value: row => row.items.length }, { field: "total", label: "Total", width: 160, value: row => Number(row.total), render: row => formatCurrency(Number(row.total)) }];
  return <section><FeatureHeading title={kind === "sales" ? "Sales Reports" : "Purchase Reports"} description={kind === "sales" ? "Analyze completed sales and product performance" : "Analyze received purchases and supplier spending"} />
    <FeatureTable rows={rows} columns={columns} label={kind === "sales" ? "Completed orders" : "Received purchases"} timestamp={row => row.timestamp} searchText={row => row.id + " " + row.party} exportable actions={row => <button type="button" className={iconButton} aria-label={"View transaction " + row.id} onClick={() => setSelected(row)}><Eye className="size-4" /></button>} onFiltered={filtered => {
      const total = sumMoney(filtered.map(row => row.total));
      const average = filtered.length ? fromMinorUnits((toMinorUnits(total) + BigInt(Math.floor(filtered.length / 2))) / BigInt(filtered.length)) : "0.00";
      const grouped = new Map<string, bigint>();
      const products = new Map<string, { name: string; quantity: number }>();
      for (const row of filtered) { const date = philippineDate(row.timestamp); grouped.set(date, (grouped.get(date) ?? 0n) + toMinorUnits(row.total)); for (const item of row.items) { const existing = products.get(item.productId); products.set(item.productId, { name: item.name, quantity: (existing?.quantity ?? 0) + item.quantity }); } }
      const chart = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount: Number(fromMinorUnits(amount)) }));
      const top = [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
      return <><MetricCards metrics={[{ label: kind === "sales" ? "Total Sales" : "Total Received Purchases", value: formatCurrency(Number(total)) }, { label: "Total Orders", value: filtered.length.toLocaleString() }, { label: "Average Order Value", value: formatCurrency(Number(average)) }]} /><div className="mb-5 grid gap-4 lg:grid-cols-[2fr_1fr]"><div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-neutral-700 dark:bg-[#191919]"><h2 className="mb-4 text-sm font-semibold">{kind === "sales" ? "Sales" : "Purchases"} trend</h2>{chart.length ? <div role="img" aria-label={"Daily totals for " + filtered.length + " orders. Total " + formatCurrency(Number(total))} className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={value => formatCurrency(Number(value))} /><Line type="monotone" dataKey="amount" stroke="#7c3aed" strokeWidth={3} /></LineChart></ResponsiveContainer></div> : <p className="py-20 text-center text-sm text-slate-500">No transactions in this period.</p>}</div><div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-neutral-700 dark:bg-[#191919]"><h2 className="mb-5 text-sm font-semibold">{kind === "sales" ? "Top Selling Products" : "Most Purchased Products"}</h2>{top.length ? top.map(product => <div key={product.name} className="mb-4"><div className="mb-2 flex justify-between gap-3 text-sm"><span>{product.name}</span><span className="font-semibold">{product.quantity}</span></div><div className="h-1.5 rounded bg-slate-100 dark:bg-neutral-800"><div className="h-full rounded bg-violet-600" style={{ width: product.quantity / top[0].quantity * 100 + "%" }} /></div></div>) : <p className="text-sm text-slate-500">No product activity yet.</p>}</div></div></>;
    }} />
    <Modal wide open={!!selected} title="Report transaction details" onClose={() => setSelected(null)}>{selected && <TransactionDetails row={selected} />}</Modal>
  </section>;
}
