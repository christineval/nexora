"use client";
import { useGuestPreview } from "@/components/ui/GuestPreviewProvider";

import FormLabel from "@/components/ui/FormLabel";
import Link from "next/link";
import { useState } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Copy, Eye, MoreVertical, Pencil, Search } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
import ProductForm from "@/components/inventory/ProductForm";
import StockBadge from "@/components/inventory/StockBadge";
import { formatCurrency } from "@/lib/utils";
import { filterProducts, paginateProducts, type StockFilter } from "@/lib/product-list";
import type { ProductRow } from "@/types/views";
import useMutation from "@/components/ui/use-mutation";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import { primaryButton, secondaryButton } from "@/components/ui/feature-styles";

type Panel = { kind: "edit" | "details" | "actions" | "archive" | "restore" | "delete"; product: ProductRow } | null;
const control = "h-10 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-[#303030] dark:bg-[#191919]";
const iconButton = "flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-violet-50 hover:text-violet-600 focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-neutral-400 dark:hover:bg-violet-950/40 dark:hover:text-violet-300";
const actionButton = "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 dark:hover:bg-neutral-800";

export default function ProductTable({ rows, initialQuery = "", canEdit = true, canDelete = false }: { rows: ProductRow[]; initialQuery?: string; canEdit?: boolean; canDelete?: boolean }) {
  const isGuest = useGuestPreview();
  const mutation = useMutation();
  const { notify } = useNotifications();
  const [view, setView] = useState<"active" | "archived">("active");
  const canPreview = canEdit || isGuest;
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState("");
  const [stock, setStock] = useState<StockFilter>("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const visibleRows = rows.filter(product => view === "active" ? product.status === "ACTIVE" : product.status !== "ACTIVE");
  const filtered = filterProducts(visibleRows, { query, status, stock });
  const page = paginateProducts(filtered, requestedPage);
  const statuses = [...new Set(visibleRows.map((product) => product.status))].sort();
  const title = panel?.kind === "archive" ? "Archive product" : panel?.kind === "restore" ? "Restore product" : panel?.kind === "delete" ? "Permanently delete product" : panel?.kind === "edit" ? "Edit product" : panel?.kind === "actions" ? "Product actions" : "Product details";
  const product = panel?.product ?? null;
  const columns: GridColDef<ProductRow>[] = [
    { field: "rowNumber", headerName: "#", width: 55, sortable: false, filterable: false, disableColumnMenu: true, renderCell: (params) => page.start + params.api.getRowIndexRelativeToVisibleRows(params.id) },
    { field: "sku", headerName: "SKU", width: 100 },
    { field: "supplierProductCode", headerName: "Supplier Product Code", width: 180, valueFormatter: (value) => value || "-" },
    { field: "name", headerName: "Product Name", flex: 1, minWidth: 120 },
    { field: "size", headerName: "Size", width: 90, valueFormatter: (value) => value || "-" },
    { field: "stockQty", headerName: "Stock Qty", width: 100, type: "number" },
    { field: "unitCost", headerName: "Unit Cost", width: 130, type: "number", valueFormatter: (value) => formatCurrency(Number(value)) },
    { field: "sellingPrice", headerName: "Selling Price", width: 145, type: "number", valueFormatter: (value) => formatCurrency(Number(value)) },
    { field: "status", headerName: "Status", width: 110, renderCell: (params) => <span className={"rounded px-2 py-1 text-[11px] font-medium " + (params.row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300")}>{params.row.status}</span> },
    { field: "stockLevel", headerName: "Stock Level", width: 120, renderCell: (params) => <StockBadge quantity={params.row.stockQty} /> },
    { field: "actions", headerName: "Actions", width: 95, sortable: false, filterable: false, disableColumnMenu: true, renderCell: (params) => <div className="flex h-full items-center gap-1">{canPreview && <button type="button" tabIndex={params.tabIndex} aria-label={"Edit " + params.row.name} title="Edit product" className={iconButton} onClick={() => setPanel({ kind: "edit", product: params.row })}><Pencil aria-hidden="true" className="size-4" /></button>}<button type="button" tabIndex={params.tabIndex} aria-label={"Actions for " + params.row.name} title="More actions" className={iconButton} onClick={() => setPanel({ kind: "actions", product: params.row })}><MoreVertical aria-hidden="true" className="size-4" /></button></div> },
  ];

  function closePanel() { setPanel(null); setActionMessage(""); }
  function resetFilters() { setQuery(""); setStatus(""); setStock("all"); setRequestedPage(1); }
  async function copySku(value: string) {
    try { await navigator.clipboard.writeText(value); setActionMessage("SKU copied."); }
    catch { setActionMessage("Copy is unavailable. Select and copy the SKU shown above."); }
  }

  return <>
    <div className="mb-4 flex gap-2" role="group" aria-label="Product availability">
      {(["active", "archived"] as const).map(value => <button key={value} type="button" aria-pressed={view === value} className={view === value ? primaryButton : secondaryButton} onClick={() => { setView(value); resetFilters(); }}>{value === "active" ? "Active products" : "Archived products"} ({rows.filter(product => value === "active" ? product.status === "ACTIVE" : product.status !== "ACTIVE").length})</button>)}
    </div>
    <div className="mb-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_160px_180px]">
      <FormLabel label="Search products" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400" htmlFor="product-search"><span className="relative"><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" /><input id="product-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setRequestedPage(1); }} placeholder="Search by name, SKU, supplier code or size..." className={control + " w-full pr-3 pl-9 font-normal text-slate-900 dark:text-neutral-100"} /></span>
      </FormLabel>
      <FormLabel label="Status" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400" htmlFor="product-status"><select id="product-status" value={status} onChange={(event) => { setStatus(event.target.value); setRequestedPage(1); }} className={control + " w-full px-3 font-normal text-slate-700 dark:text-neutral-200"}><option value="">All Status</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      </FormLabel>
      <FormLabel label="Stock level" className="grid gap-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400" htmlFor="product-stock"><select id="product-stock" value={stock} onChange={(event) => { setStock(event.target.value as StockFilter); setRequestedPage(1); }} className={control + " w-full px-3 font-normal text-slate-700 dark:text-neutral-200"}><option value="all">All Stock Levels</option><option value="in-stock">In stock</option><option value="low-stock">Low stock</option><option value="out-of-stock">Out of stock</option></select>
      </FormLabel>
    </div>

    {(query || status || stock !== "all") && <button type="button" onClick={resetFilters} className="mb-3 text-sm font-medium text-violet-600 hover:underline dark:text-violet-400">Clear filters</button>}

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[#303030] dark:bg-[#191919]">
      <div className="h-[432px] w-full">
        <DataGrid
          aria-label="Product inventory"
          rows={filtered}
          columns={columns}
          getRowId={(row) => row.productId}
          rowHeight={48}
          columnHeaderHeight={44}
          disableRowSelectionOnClick
          disableColumnFilter
          hideFooter
          paginationModel={{ page: page.page - 1, pageSize: 8 }}
          pageSizeOptions={[8]}
          onPaginationModelChange={(model) => setRequestedPage(model.page + 1)}
          onSortModelChange={() => setRequestedPage(1)}
          localeText={{ noRowsLabel: rows.length ? "No products match your filters" : "No products yet" }}
          className="rounded-none! border-0! text-[13px]! [&_.MuiDataGrid-columnHeader]:bg-slate-50 [&_.MuiDataGrid-columnHeaderTitle]:text-[11px] [&_.MuiDataGrid-columnHeaderTitle]:font-semibold dark:[&_.MuiDataGrid-columnHeader]:bg-[#222222]"
        />
      </div>
      <Pagination page={page.page} pageCount={page.pageCount} start={page.start} end={page.end} total={page.total} label="products" navigationLabel="Product pagination" onPageChange={setRequestedPage} />
    </div>

    <Modal key={panel ? panel.kind + (product?.productId ?? "") : "closed"} open={panel !== null} busy={busy || mutation.saving} title={title} onClose={closePanel}>
      {panel?.kind === "edit" && canPreview && <ProductForm catalog={rows} product={panel.product} onSuccess={closePanel} onSavingChange={setBusy} />}
      {panel?.kind === "actions" && product && canEdit && !isGuest && <div className="mt-4 space-y-1"><button type="button" className={actionButton} onClick={() => setPanel({ kind: product.status === "ACTIVE" ? "archive" : "restore", product })}>{product.status === "ACTIVE" ? "Archive product" : "Restore product"}</button>{canDelete && product.status !== "ACTIVE" && <button type="button" className={actionButton + " text-red-600 dark:text-red-400"} onClick={() => setPanel({ kind: "delete", product })}>Permanently delete product</button>}</div>}
      {product && canEdit && !isGuest && (panel?.kind === "archive" || panel?.kind === "restore" || panel?.kind === "delete") && <form className="mt-5 space-y-4" onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const deleting = panel.kind === "delete";
        const body = deleting ? { password: String(form.get("password") ?? "") } : { action: panel.kind, acknowledgeStock: form.get("acknowledgeStock") === "on" };
        if (deleting) event.currentTarget.reset();
        void mutation.submit("/api/products/" + product.productId + (deleting ? "" : "/lifecycle"), deleting ? "DELETE" : "POST", body, () => { closePanel(); notify(deleting ? "Product permanently deleted." : panel.kind === "archive" ? "Product archived." : "Product restored."); });
      }}><p className="text-sm font-medium">{product.name} / {product.sku}</p><fieldset disabled={mutation.saving} className="space-y-4">
        {panel.kind === "archive" && <><p className="text-sm text-slate-500 dark:text-neutral-400">Hide this product from new sales, purchases and stock adjustments. Existing records and stock are preserved. You can restore it later.</p>{product.stockQty > 0 && <label className="flex items-start gap-2 rounded-lg border border-amber-400 p-3 text-sm"><input name="acknowledgeStock" type="checkbox" required className="mt-1" /><span>I understand this product still has {product.stockQty.toLocaleString()} units in stock. Restore it before using that stock in new operations.</span></label>}</>}
        {panel.kind === "restore" && <p className="text-sm text-slate-500 dark:text-neutral-400">Reactivate this product for new transactions. Its SKU, stock and history stay intact.</p>}
        {panel.kind === "delete" && canDelete && <><p className="text-sm text-red-600 dark:text-red-400">This permanently removes the product record and cannot be undone. Deletion requires zero stock and no sales, purchases or stock movements. The audit record is retained.</p>{product.stockQty !== 0 && <p role="alert" className="text-sm text-red-600">Deletion is blocked: this product has {product.stockQty.toLocaleString()} units in stock.</p>}<FormLabel label="Your current password" required><input name="password" type="password" autoComplete="current-password" required maxLength={72} className={control + " w-full px-3"} /></FormLabel></>}
        <div className="flex justify-end gap-3"><button type="button" className={secondaryButton} onClick={closePanel}>Cancel</button><button type="submit" disabled={mutation.saving || (panel.kind === "delete" && (!canDelete || product.stockQty !== 0))} className={primaryButton + (panel.kind === "delete" ? " bg-red-600 hover:bg-red-700" : "")}>{mutation.saving ? "Saving..." : panel.kind === "delete" ? "Permanently delete" : panel.kind === "archive" ? "Archive product" : "Restore product"}</button></div>
      </fieldset></form>}
      {panel?.kind === "actions" && product && <div className="mt-4 min-w-64 space-y-1"><p className="mb-3 text-sm text-slate-500 dark:text-neutral-400">{product.name} / <span className="select-all">{product.sku}</span></p><button type="button" className={actionButton} onClick={() => setPanel({ kind: "details", product })}><Eye className="size-4" aria-hidden="true" />View details</button>{canPreview && <button type="button" className={actionButton} onClick={() => setPanel({ kind: "edit", product })}><Pencil className="size-4" aria-hidden="true" />Edit product</button>}<button type="button" className={actionButton} onClick={() => copySku(product.sku)}><Copy className="size-4" aria-hidden="true" />Copy SKU</button><Link className={actionButton} href={"/inventory/products/" + product.productId}>View stock movements</Link>{actionMessage && <p role="status" className="p-3 text-sm text-slate-500 dark:text-neutral-400">{actionMessage}</p>}</div>}
      {panel?.kind === "details" && product && <dl className="mt-5 grid min-w-64 grid-cols-2 gap-x-6 gap-y-4 text-sm">{[["SKU", product.sku], ["Supplier product code", product.supplierProductCode || "-"], ["Product name", product.name], ["Size", product.size || "-"], ["Stock quantity", product.stockQty.toLocaleString()], ["Unit cost", formatCurrency(product.unitCost)], ["Selling price", formatCurrency(product.sellingPrice)], ["Status", product.status]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500 dark:text-neutral-400">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}<div className="col-span-2"><dt className="mb-2 text-xs text-slate-500 dark:text-neutral-400">Stock level</dt><dd><StockBadge quantity={product.stockQty} /></dd></div></dl>}
    </Modal>
  </>;
}

