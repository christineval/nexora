"use client";
import { numericInputProps } from "@/lib/numeric-input";
import { useState } from "react";
import { Plus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import useMutation from "@/components/ui/use-mutation";
import { control, primaryButton } from "@/components/ui/feature-styles";
import type { ProductRow } from "@/types/views";
export default function AdjustStockModal({ products }: { products: ProductRow[] }) {
  const [open, setOpen] = useState(false);
  const { notify } = useNotifications();
  const mutation = useMutation();
  return <><div><button type="button" className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Adjust Stock</button></div><Modal key={open ? "open" : "closed"} open={open} busy={mutation.saving} title="Adjust inventory" onClose={() => setOpen(false)}><form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutation.submit("/api/inventory/adjustments", "POST", { productId: form.get("productId"), type: form.get("type"), quantity: Number(form.get("quantity")) }, () => { setOpen(false); notify("Stock adjusted and movement recorded."); }); }}><fieldset disabled={mutation.saving} className="grid gap-4"><label className="grid gap-1.5 text-sm">Product *<select name="productId" required className={control}><option value="">Select product</option>{products.filter(product => product.status === "ACTIVE").map(product => <option key={product.productId} value={product.productId}>{product.name} ({product.sku}) — {product.stockQty} units</option>)}</select></label><label className="grid gap-1.5 text-sm">Direction *<select name="type" className={control}><option value="ADJUSTMENT_IN">Add stock</option><option value="ADJUSTMENT_OUT">Remove stock</option></select></label><label className="grid gap-1.5 text-sm">Quantity *<input {...numericInputProps()} name="quantity" type="number" min={1} max={2147483647} step={1} required className={control} /></label><p className="text-xs text-slate-500 dark:text-neutral-400">This records an inventory adjustment with your user account. Use purchase receiving and sales completion for normal business transactions.</p><button type="submit" disabled={mutation.saving} className={primaryButton}>{mutation.saving ? "Saving..." : "Confirm adjustment"}</button></fieldset></form></Modal></>;
}
