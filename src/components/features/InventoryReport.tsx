"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import Modal from "@/components/ui/Modal";
import RecordDetails from "@/components/ui/RecordDetails";
import FeatureHeading from "@/components/ui/FeatureHeading";
import FeatureTable, { type FeatureColumn } from "@/components/ui/FeatureTable";
import MetricCards from "./MetricCards";
import StockBadge from "@/components/inventory/StockBadge";
import { control, iconButton } from "@/components/ui/feature-styles";
import { formatCurrency } from "@/lib/utils";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { ProductRow } from "@/types/views";
type Row = ProductRow & { id: string };
export default function InventoryReport({ rows }: { rows: ProductRow[] }) {
  const [stock, setStock] = useState("");
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const filtered = rows.filter(row => !stock || (stock === "out" ? row.stockQty === 0 : stock === "low" ? row.stockQty > 0 && row.stockQty <= 10 : row.stockQty > 10)).map(row => ({ ...row, id: row.productId }));
  const columns: FeatureColumn<Row>[] = [{ field: "sku", label: "SKU", width: 130, value: row => row.sku }, { field: "name", label: "Product", width: 260, value: row => row.name }, { field: "stock", label: "Stock Qty", width: 110, value: row => row.stockQty }, { field: "level", label: "Stock Level", width: 140, value: row => row.stockQty, render: row => <StockBadge quantity={row.stockQty} /> }, { field: "cost", label: "Unit Cost", width: 150, value: row => row.unitCost, render: row => formatCurrency(row.unitCost) }, { field: "value", label: "Current Cost Value", width: 180, value: row => row.unitCost * row.stockQty, render: row => formatCurrency(row.unitCost * row.stockQty) }, { field: "status", label: "Status", width: 140, value: row => row.status }];
  return <section><FeatureHeading title="Inventory Reports" description="Current stock and valuation at the product's current unit cost" /><label className="mb-4 grid max-w-xs gap-1.5 text-xs text-slate-500">Stock level<select value={stock} onChange={event => setStock(event.target.value)} className={control}><option value="">All stock levels</option><option value="in">In stock (above 10)</option><option value="low">Low stock (1–10)</option><option value="out">Out of stock</option></select></label><FeatureTable key={stock} rows={filtered} columns={columns} label="Products" searchText={row => row.name + " " + row.sku} statusValue={row => row.status} exportable actions={row => <button type="button" className={iconButton} aria-label={"View product " + row.name} onClick={() => setSelected(row)}><Eye className="size-4" /></button>} onFiltered={current => <MetricCards metrics={[{ label: "Products", value: current.length.toLocaleString() }, { label: "Stock Units", value: current.reduce((sum, row) => sum + row.stockQty, 0).toLocaleString() }, { label: "Current Cost Value", value: formatCurrency(Number(fromMinorUnits(current.reduce((sum, row) => sum + toMinorUnits(row.unitCost.toFixed(2)) * BigInt(row.stockQty), 0n)))), note: "Uses current unit cost; not historical accounting valuation." }]} />} /><Modal open={!!selected} title="Inventory report details" onClose={() => setSelected(null)}>{selected && <RecordDetails fields={[["Product", selected.name], ["SKU", selected.sku], ["Stock quantity", selected.stockQty], ["Status", selected.status], ["Unit cost", formatCurrency(selected.unitCost)], ["Selling price", formatCurrency(selected.sellingPrice)]]} />}</Modal></section>;
}
