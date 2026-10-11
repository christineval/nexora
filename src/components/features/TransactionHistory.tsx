"use client";

import Link from "next/link";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { TransactionRow } from "@/types/features";

export default function TransactionHistory({ kind, rows }: { kind: "sales" | "purchasing"; rows: TransactionRow[] }) {
  const columns: FeatureColumn<TransactionRow>[] = [
    { field: "reference", label: "Reference", value: row => "#" + row.id, render: row => <Link className="text-violet-600 dark:text-violet-400" href={"/" + kind + "/" + row.id}>#{row.id}</Link> },
    { field: "date", label: "Date", width: 230, value: row => formatDateTime(row.timestamp) },
    { field: "status", label: "Status", value: row => row.status },
    { field: "total", label: "Total", value: row => Number(row.total), render: row => formatCurrency(Number(row.total)) },
  ];

  return <FeatureTable rows={rows} columns={columns} label={kind === "sales" ? "Sales history" : "Purchase history"} searchText={row => row.id} statusValue={row => row.status} timestamp={row => row.timestamp} />;
}
