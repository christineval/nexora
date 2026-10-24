"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import type { ProductRow } from "@/types/views";
import FormLabel from "../ui/FormLabel";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import { suggestSellingPrice } from "@/lib/money";
import { formatCurrency } from "@/lib/utils";
import { secondaryButton } from "@/components/ui/feature-styles";

interface ProductFormProps {
  product?: ProductRow;
  nextSku?: string;
  onSuccess?: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export default function ProductForm({ 
  product, nextSku, onSuccess, onSavingChange }: ProductFormProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [unitCost, setUnitCost] = useState(product ? String(product.unitCost) : "");
    const [sellingPrice, setSellingPrice] = useState(product ? String(product.sellingPrice) : "");
    const [markup, setMarkup] = useState(30);
    const markupId = useId();
    const lock = useRef(false);
    const { notify, dismiss } = useNotifications();

    const sku = product?.sku ?? nextSku ?? ""; 
    const suggestedPrice = suggestSellingPrice(unitCost, markup);

    async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (lock.current) return;
    lock.current = true;
    onSavingChange?.(true);
    setIsSaving(true);
    dismiss();

    try {
      const formData = new FormData(event.currentTarget);

      const response = await fetch("/api/products" + (product ? "/" + product.productId : ""), {
        method: product ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          supplierProductCode: String(formData.get("supplierProductCode") ?? ""),
          size: String(formData.get("size") ?? ""),
          unitCost: formData.get("unitCost"),
          sellingPrice: formData.get("sellingPrice"),
          ...(product ? { status: formData.get("status") } : { quantity: Number(formData.get("quantity")) }),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ?? "Unable to create product"
        );
      }

      onSuccess?.();
      notify(product ? "Product updated successfully." : "Product created successfully.");
      router.refresh();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Something went wrong",
        "error"
      );
    } finally {
      lock.current = false;
      setIsSaving(false);
      onSavingChange?.(false);
    }
  }


    return <form onSubmit={handleSubmit} className="mt-5 space-y-5">
      <fieldset disabled={isSaving} className="grid items-start gap-4 sm:grid-cols-2 [&>label]:min-w-0 [&_input]:min-w-0 [&_input]:w-full">
        <div className="min-w-0 space-y-1.5"><FormLabel label="Internal SKU"><Input name="sku" value={sku || "Assigned when saved"} readOnly /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">Generated automatically; stays unchanged.</p></div>
        <div className="min-w-0 space-y-1.5"><FormLabel label="Supplier product code"><Input name="supplierProductCode" defaultValue={product?.supplierProductCode ?? ""} maxLength={150} placeholder="e.g. BP-TBR-R" /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">Enter or correct the code from the supplier invoice.</p></div>
        <FormLabel label="Product name" required className="sm:col-span-2"><Input name="name" defaultValue={product?.name} maxLength={150} required /></FormLabel>
        <FormLabel label="Size"><Input name="size" defaultValue={product?.size ?? ""} maxLength={50} /></FormLabel>
        <FormLabel label="Unit cost (PHP)" required><Input name="unitCost" type="number" min="0" max="9999999999.99" step="0.01" required value={unitCost} onChange={event => setUnitCost(event.target.value)} /></FormLabel>
        {!product && <div className="space-y-4 rounded-xl border border-slate-200 p-4 sm:col-span-2 dark:border-neutral-700">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><label htmlFor={markupId} className="text-sm font-medium">Markup on cost</label><span aria-hidden="true" className="text-sm font-semibold tabular-nums">{markup}%</span></div>
            <input id={markupId} type="range" min={0} max={100} step={1} value={markup} aria-valuetext={`${markup}% markup on cost`} onChange={event => setMarkup(Number(event.target.value))} className="h-6 w-full cursor-pointer accent-violet-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500 disabled:cursor-not-allowed dark:accent-violet-400" />
            <div className="flex justify-between text-xs text-slate-500 dark:text-neutral-400"><span>0%</span><span>100%</span></div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div aria-live="polite" aria-atomic="true"><p className="text-sm text-slate-500 dark:text-neutral-400">Suggested selling price</p><p className="mt-1 text-2xl font-semibold tabular-nums">{suggestedPrice === null ? "—" : formatCurrency(Number(suggestedPrice))}</p></div>
            <button type="button" className={secondaryButton} disabled={suggestedPrice === null} onClick={() => { if (suggestedPrice !== null) setSellingPrice(suggestedPrice); }}>Use suggested price</button>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Cost + markup, rounded to the nearest cent. Apply the suggestion or enter your own selling price.</p>
          {suggestedPrice === null && unitCost !== "" && <p className="text-xs text-amber-700 dark:text-amber-400">Enter a cost with up to two decimal places and keep the suggested price within PHP 9,999,999,999.99.</p>}
        </div>}
        <FormLabel label="Selling price (PHP)" required><Input name="sellingPrice" type="number" min="0" max="9999999999.99" step="0.01" required value={sellingPrice} onChange={event => setSellingPrice(event.target.value)} /></FormLabel>
        {!product && <div className="min-w-0 space-y-1.5"><FormLabel label="Quantity" required><Input name="quantity" type="number" min={0} max={2147483647} step={1} required defaultValue={0} /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">Starting stock on hand. A positive quantity is recorded as an inventory adjustment.</p></div>}
        {product && <><FormLabel label="Status"><select name="status" defaultValue={product.status} className="rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"><option>ACTIVE</option><option>INACTIVE</option><option>DISCONTINUED</option></select></FormLabel><div className="min-w-0 space-y-1.5"><FormLabel label="Current stock"><Input value={product.stockQty} readOnly /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">Use Stock Movements to adjust quantity after creation.</p></div></>}
      </fieldset>
      <div className="flex justify-end">
        <button type="submit" disabled={isSaving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving..." : product ? "Save changes" : "Create product"}</button>
      </div>
    </form>;
}
