"use client";

import FormLabel from "@/components/ui/FormLabel";
import { useState } from "react";
import { CalendarDays, ChevronDown, Eye, Search } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
import RecordDetails from "@/components/ui/RecordDetails";
import { iconButton } from "@/components/ui/feature-styles";
import Table from "@/components/ui/Table";
import {
  filterInventoryMovements, formatMovementDate, movementReference, paginateInventoryMovements,
  type MovementFilters,
} from "@/lib/inventory-movements";
import type { InventoryMovementRow } from "@/types/views";
import { stockDelta } from "@/lib/stock";

const defaultFilters: MovementFilters = { query: "", type: "", productId: "", from: "", to: "" };
const control = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-[#303030] dark:bg-[#191919] dark:text-neutral-200";
const typeColors: Record<string, string> = {
  SALE: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  PURCHASE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ADJUSTMENT_IN: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  ADJUSTMENT_OUT: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export default function MovementTable({ rows }: { rows: InventoryMovementRow[] }) {
  const [filters, setFilters] = useState(defaultFilters);
  const [requestedPage, setRequestedPage] = useState(1);
  const [selected, setSelected] = useState<InventoryMovementRow | null>(null);
  const filtered = filterInventoryMovements(rows, filters);
  const page = paginateInventoryMovements(filtered, requestedPage);
  const types = [...new Set(rows.map((row) => row.type))].sort();
  const products = [...new Map(rows.map((row) => [row.productId, { id: row.productId, name: row.productName, sku: row.productSku }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const hasFilters = Object.values(filters).some(Boolean);
  const dateLabel = filters.from || filters.to
    ? `${filters.from ? formatMovementDate(filters.from + "T00:00:00+08:00") : "Any date"} – ${filters.to ? formatMovementDate(filters.to + "T00:00:00+08:00") : "Any date"}`
    : "All dates";

  function updateFilter(key: keyof MovementFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setRequestedPage(1);
  }

  return <>
    <div className="mb-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_160px_200px_280px]">
      <FormLabel label="Search movements" htmlFor="movement-search" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400"><span className="relative"><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" /><input id="movement-search" type="search" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Search products, references..." className={control + " pl-9"} /></span>
      </FormLabel>
      <FormLabel label="Movement type" htmlFor="movement-type" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400"><select id="movement-type" className={control} value={filters.type} onChange={(event) => updateFilter("type", event.target.value)}><option value="">All Types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select>
      </FormLabel>
      <FormLabel label="Product" htmlFor="movement-product" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400"><select id="movement-product" className={control} value={filters.productId} onChange={(event) => updateFilter("productId", event.target.value)}><option value="">All Products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select>
      </FormLabel>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">Date range</span>
        <details className="relative">
          <summary aria-label={"Filter by date range: " + dateLabel} className={control + " flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"}><CalendarDays aria-hidden="true" className="size-4 shrink-0 text-slate-400" /><span className="flex-1 text-xs">{dateLabel}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-400" /></summary>
          <div className="absolute right-0 z-20 mt-2 w-full min-w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-[#303030] dark:bg-[#191919]">
            <p className="mb-3 text-xs text-slate-500 dark:text-neutral-400">Dates use Philippine time.</p>
            <div className="grid gap-3">
              <FormLabel label="From" htmlFor="movement-from" className="grid gap-1.5 text-xs font-medium"><input id="movement-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => updateFilter("from", event.target.value)} aria-invalid={invalidRange} aria-describedby={invalidRange ? "movement-date-error" : undefined} className={control + " dark:[color-scheme:dark]"} />
              </FormLabel>
              <FormLabel label="To" htmlFor="movement-to" className="grid gap-1.5 text-xs font-medium"><input id="movement-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilter("to", event.target.value)} aria-invalid={invalidRange} aria-describedby={invalidRange ? "movement-date-error" : undefined} className={control + " dark:[color-scheme:dark]"} />
              </FormLabel>
            </div>
            {invalidRange && <p id="movement-date-error" role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-300">Choose an end date on or after the start date.</p>}
            <button type="button" className="mt-3 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400" onClick={() => { setFilters((current) => ({ ...current, from: "", to: "" })); setRequestedPage(1); }}>Clear dates</button>
          </div>
        </details>
      </div>
    </div>
    {hasFilters && <button type="button" onClick={() => { setFilters(defaultFilters); setRequestedPage(1); }} className="mb-3 text-sm font-medium text-violet-600 hover:underline dark:text-violet-400">Clear filters</button>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[#303030] dark:bg-[#191919]">
      <div className="min-h-[432px] [&_table]:min-w-[780px] [&_table]:text-[13px] [&_th]:bg-slate-50 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:text-slate-600 [&_td]:h-12 [&_td]:py-3 dark:[&_th]:bg-[#222222] dark:[&_th]:text-neutral-300">
        <Table headers={["#", "Date", "Product", "Type", "Quantity", "Reference", "Created By", "Actions"]} emptyMessage={rows.length ? "No movements match your filters." : "No inventory movements yet."} rows={page.rows.map((row, index) => ({
          id: row.id,
          cells: [page.start + index,
            <time key="date" dateTime={row.timestamp} className="whitespace-nowrap">{formatMovementDate(row.timestamp)}</time>,
            row.productName,
            <span key="type" className={"whitespace-nowrap rounded px-2 py-1 text-[10px] font-semibold " + (typeColors[row.type] ?? "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300")}>{row.type}</span>,
            <span key="quantity" className={"font-semibold tabular-nums " + (stockDelta(row.type, row.quantity) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{stockDelta(row.type, row.quantity) > 0 ? "+" : ""}{stockDelta(row.type, row.quantity).toLocaleString("en-PH")}</span>,
            movementReference(row), row.createdBy, <button key="details" type="button" aria-label={"View movement " + row.id} className={iconButton} onClick={() => setSelected(row)}><Eye className="size-4" /></button>],
        }))} />
      </div>
      <Pagination page={page.page} pageCount={page.pageCount} start={page.start} end={page.end} total={page.total} label="movements" navigationLabel="Inventory movement pagination" onPageChange={setRequestedPage} />
    </div>
    <Modal open={!!selected} title="Inventory movement details" onClose={() => setSelected(null)}>{selected && <RecordDetails fields={[["Product", selected.productName], ["SKU", selected.productSku], ["Date", formatMovementDate(selected.timestamp)], ["Type", selected.type], ["Stock change", stockDelta(selected.type, selected.quantity).toLocaleString("en-PH")], ["Reference", movementReference(selected)], ["Created by", selected.createdBy]]} />}</Modal>
  </>;
}
