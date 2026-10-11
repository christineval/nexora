"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { control, iconButton, primaryButton, secondaryButton } from "@/components/ui/feature-styles";
import { philippineDate } from "@/lib/feature-list";
import { formatCurrency } from "@/lib/utils";
import type { ProductRow } from "@/types/views";
import type { ContactRow, TransactionRow } from "@/types/features";
import type { TransactionInput } from "@/validations/shared";

export default function TransactionForm({ kind, parties, products, saving, onSubmit, initialRow }: { kind: "sales" | "purchasing"; parties: ContactRow[]; products: ProductRow[]; saving: boolean; onSubmit: (data: TransactionInput) => void; initialRow?: TransactionRow }) {
  const [lines, setLines] = useState(initialRow ? initialRow.items.map((item, key) => ({ key, productId: item.productId, quantity: item.quantity })) : [{ key: 0, productId: "", quantity: 1 }]);
  const [nextKey, setNextKey] = useState(initialRow?.items.length ?? 1);
  const [partyId, setPartyId] = useState(initialRow?.partyId ?? "");
  const party = parties.find(row => row.id === partyId);
  const active = products.filter(product => product.status === "ACTIVE");
  const total = lines.reduce((sum, line) => { const product = products.find(product => product.productId === line.productId); return sum + (product ? (kind === "sales" ? product.sellingPrice : product.unitCost) * line.quantity : 0); }, 0);
  
  function change(key: number, field: "productId" | "quantity", value: string) { setLines(current => current.map(line => line.key === key ? { ...line, [field]: field === "quantity" ? Number(value) : value } : line)); }
  
  return <form className="mt-5 space-y-5" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    onSubmit({ partyId, date: String(data.get("date")), items: lines.map(line => ({ productId: line.productId, quantity: line.quantity })) });
  }}><fieldset disabled={saving} className="space-y-5">
    
    <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm">{kind === "sales" ? "Customer" : "Supplier"} *<select required className={control} value={partyId} onChange={event => setPartyId(event.target.value)}><option value="">Select {kind === "sales" ? "customer" : "supplier"}</option>{parties.filter(row => row.status === "ACTIVE").map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="grid gap-1.5 text-sm">{kind === "sales" ? "Order" : "Purchase"} date *<input name="date" type="date" required className={control} defaultValue={philippineDate(initialRow?.timestamp ?? new Date().toISOString())} /></label></div>
    
    {party && <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-neutral-800"><p className="font-medium">{party.name}</p><p className="mt-1 text-slate-500 dark:text-neutral-400">{[party.email, party.phone, party.address].filter(Boolean).join(" · ") || "No contact details recorded"}</p></div>}
    
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Products</h3><button type="button" className={secondaryButton} disabled={lines.length >= 100 || lines.length >= active.length} onClick={() => { setLines(current => [...current, { key: nextKey, productId: "", quantity: 1 }]); setNextKey(nextKey + 1); }}><Plus className="size-4" />Add line</button></div>
    
    {lines.map((line, index) => { const product = active.find(product => product.productId === line.productId); const price = product ? (kind === "sales" ? product.sellingPrice : product.unitCost) : 0;
      return <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_90px_100px_32px] dark:border-neutral-700">
        <label className="col-span-3 grid min-w-0 gap-1.5 text-xs sm:col-span-1">Product {index + 1} *<select required className={control + " min-w-0"} value={line.productId} onChange={event => change(line.key, "productId", event.target.value)}><option value="">Select product</option>{active.filter(product => product.productId === line.productId || !lines.some(other => other.productId === product.productId)).map(product => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></label>
        <label className="grid gap-1.5 text-xs">Quantity *<input type="number" min={1} max={2147483647} step={1} required className={control} value={line.quantity || ""} onChange={event => change(line.key, "quantity", event.target.value)} /></label>
        <div className="grid gap-1.5 text-xs">
          <span>Line total</span>
          <div className="flex h-10 items-center text-sm font-medium">{formatCurrency(price * line.quantity)}</div></div>
        
        <button type="button" aria-label={"Remove product " + (index + 1)} className={iconButton} disabled={lines.length === 1} onClick={() => setLines(current => current.filter(other => other.key !== line.key))}><Trash2 className="size-4" /></button>
        <p aria-hidden={!product} className="col-span-3 col-start-1 row-start-2 min-h-7 text-xs leading-5 text-slate-500 sm:col-span-1 dark:text-neutral-400">{product ? formatCurrency(price) + " / unit \u00b7 " + product.stockQty + " in stock" : "\u00a0"}</p>
      </div>;
    })}
    {!active.length && <p className="text-sm text-amber-600">Create an active product before entering an order.</p>}
    <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30">
      <p className="text-right font-semibold">Estimated total: {formatCurrency(total)}</p><p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">Prices and totals are calculated again on the server. {kind === "sales" ? "Tax is zero. Stock changes only when a confirmed order is completed." : "Stock changes only when an ordered purchase is received."}</p></div>
    
    <div className="flex justify-end"><button type="submit" disabled={saving || !active.length || !parties.some(row => row.status === "ACTIVE")} className={primaryButton}>{saving ? "Saving..." : initialRow ? "Save pending order" : "Create pending " + (kind === "sales" ? "order" : "purchase")}</button></div>
  </fieldset></form>;
}
