"use client";
import FormLabel from "@/components/ui/FormLabel";
import { useId, useState } from "react";
import Pagination from "./Pagination";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Download, Search } from "lucide-react";
import { control, secondaryButton } from "./feature-styles";
import { csvCell, filterFeatureRows, philippineDate } from "@/lib/feature-list";
export type FeatureColumn<T> = { field: string; label: string; width?: number; value: (row: T) => string | number; render?: (row: T) => React.ReactNode };
export default function FeatureTable<T extends { id: string }>({ rows, columns, label, searchText, statusValue = () => "", timestamp, actions, exportable = false, onFiltered }: {
  rows: T[]; columns: FeatureColumn<T>[]; label: string; searchText: (row: T) => string;
  statusValue?: (row: T) => string; timestamp?: (row: T) => string;
  actions?: (row: T) => React.ReactNode; exportable?: boolean; onFiltered?: (rows: T[]) => React.ReactNode;
}) {
  const id = useId();
  const today = philippineDate(new Date().toISOString());
  const [filters, setFilters] = useState({ query: "", status: "", from: "", to: "" });
  const [requestedPage, setPage] = useState(0);
  const filtered = filterFeatureRows(rows, filters, searchText, statusValue, timestamp);
  const statuses = [...new Set(rows.map(statusValue).filter(Boolean))].sort();
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const page = Math.min(requestedPage, pageCount - 1);
  const start = filtered.length ? page * 8 + 1 : 0;
  const end = Math.min(filtered.length, (page + 1) * 8);
  function update(key: keyof typeof filters, value: string) { if ((key === "from" || key === "to") && value > today) return; setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function download() {
    const content = [columns.map(column => csvCell(column.label)).join(","), ...filtered.map(row => columns.map(column => csvCell(column.value(row))).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = label.toLowerCase().replaceAll(" ", "-") + ".csv"; link.click(); URL.revokeObjectURL(url);
  }
  const gridColumns: GridColDef<T>[] = [
    { field: "rowNumber", headerName: "#", width: 55, sortable: false, renderCell: params => start + params.api.getRowIndexRelativeToVisibleRows(params.id) },
    ...columns.map(column => ({ field: column.field, headerName: column.label, width: column.width ?? 160, valueGetter: (_value: unknown, row: T) => column.value(row), renderCell: column.render ? (params: { row: T }) => column.render?.(params.row) : undefined })),
    ...(actions ? [{ field: "actions", headerName: "Actions", width: 100, sortable: false, renderCell: (params: { row: T }) => <div className="flex h-full items-center gap-1">{actions(params.row)}</div> }] : []),
  ];
  return <>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <FormLabel label={"Search " + (label.toLowerCase())} htmlFor={id + "search"} className="grid min-w-48 flex-1 gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400"><span className="relative"><Search aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-4" /><input id={id + "search"} type="search" value={filters.query} onChange={event => update("query", event.target.value)} placeholder="Search records..." className={control + " pl-9"} /></span></FormLabel>
      {statuses.length > 0 && <FormLabel label="Status / type" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400"><select className={control + " min-w-36"} value={filters.status} onChange={event => update("status", event.target.value)}><option value="">All</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></FormLabel>}
      {timestamp && <><FormLabel label="From (PH time)" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400"><input type="date" className={control} value={filters.from} max={filters.to && filters.to < today ? filters.to : today} onChange={event => update("from", event.target.value)} /></FormLabel><FormLabel label="To (PH time)" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400"><input type="date" className={control} value={filters.to} max={today} min={filters.from || undefined} onChange={event => update("to", event.target.value)} /></FormLabel></>}
      {exportable && <button className={secondaryButton} onClick={download} type="button"><Download className="size-4" aria-hidden="true" />Export CSV</button>}
    </div>
    {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="mb-3 text-sm text-rose-600">Choose an end date on or after the start date.</p>}
    {Object.values(filters).some(Boolean) && <button type="button" className="mb-3 text-sm font-medium text-violet-600 dark:text-violet-400" onClick={() => { setFilters({ query: "", status: "", from: "", to: "" }); setPage(0); }}>Clear filters</button>}
    {onFiltered?.(filtered)}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[#303030] dark:bg-[#191919]">
      <div className="h-[432px]"><DataGrid aria-label={label} rows={filtered} columns={gridColumns} rowHeight={48} columnHeaderHeight={44} hideFooter disableRowSelectionOnClick disableColumnFilter paginationModel={{ page, pageSize: 8 }} pageSizeOptions={[8]} onPaginationModelChange={model => setPage(model.page)} onSortModelChange={() => setPage(0)} localeText={{ noRowsLabel: rows.length ? "No records match your filters" : "No records yet" }} className="rounded-none! border-0! text-[13px]! [&_.MuiDataGrid-columnHeader]:bg-slate-50 [&_.MuiDataGrid-columnHeaderTitle]:text-[11px] [&_.MuiDataGrid-columnHeaderTitle]:font-semibold dark:[&_.MuiDataGrid-columnHeader]:bg-[#222222]" /></div>
      <Pagination page={page + 1} pageCount={pageCount} start={start} end={end} total={filtered.length} label={label} onPageChange={number => setPage(number - 1)} />
    </div>
  </>;
}
