"use client";
import { useGuestPreview } from "@/components/ui/GuestPreviewProvider";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import type { ProductRow } from "@/types/views";
import FormLabel from "../ui/FormLabel";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import { suggestSellingPrice } from "@/lib/money";
import { formatCurrency } from "@/lib/utils";
import { secondaryButton } from "@/components/ui/feature-styles";
import { createProductRequestSchema, createProductSchema, updateProductSchema } from "@/validations/product.schema";
import { validationMessages } from "@/lib/validation-errors";
import { productBarcodesDuplicate, productsDuplicate } from "@/lib/record-identity";
import { numericInputProps } from "@/lib/numeric-input";

interface ProductFormProps {
  product?: ProductRow;
  nextSku?: string;
  catalog?: ProductRow[];
  onSuccess?: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export default function ProductForm({ 
  product, nextSku, catalog = [], onSuccess, onSavingChange }: ProductFormProps) {
  const isGuest = useGuestPreview();
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [unitCost, setUnitCost] = useState(product ? String(product.unitCost) : "");
    const [sellingPrice, setSellingPrice] = useState(product ? String(product.sellingPrice) : "");
    const [markup, setMarkup] = useState(30);
    const [name, setName] = useState(product?.name ?? "");
    const [size, setSize] = useState(product?.size ?? "");
    const [supplierProductCode, setSupplierProductCode] = useState(product?.supplierProductCode ?? "");
    const markupId = useId();
    const lock = useRef(false);
    const { notify, dismiss } = useNotifications();

    const sku = product?.sku ?? nextSku ?? ""; 
    const suggestedPrice = suggestSellingPrice(unitCost, markup);
    const priceValidation = createProductSchema.safeParse({ name: "Product", unitCost, sellingPrice });
    const priceError = sellingPrice && !priceValidation.success ? priceValidation.error.issues.find(issue => issue.path[0] === "sellingPrice")?.message : undefined;
    const duplicateProduct = !!name.trim() && catalog.some(row => row.productId !== product?.productId && productsDuplicate(row, { name, size }));
    const duplicateBarcode = catalog.some(row => row.productId !== product?.productId && productBarcodesDuplicate(row, { supplierProductCode }));

    async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isGuest || lock.current) return;
    lock.current = true;
    onSavingChange?.(true);
    setIsSaving(true);
    dismiss();

    try {
      const formData = new FormData(event.currentTarget);
      const validation = (product ? updateProductSchema : createProductRequestSchema).safeParse({
        name: String(formData.get("name") ?? ""), supplierProductCode: String(formData.get("supplierProductCode") ?? ""),
        size: String(formData.get("size") ?? ""), unitCost: formData.get("unitCost"), sellingPrice: formData.get("sellingPrice"),
        ...(product ? { status: product.status } : { quantity: Number(formData.get("quantity")) }),
      });
      if (!validation.success) throw new Error(validationMessages(validation.error.issues)[0]);
      if (catalog.some(row => row.productId !== product?.productId && productBarcodesDuplicate(row, validation.data))) throw new Error("A product with this barcode already exists. Select the existing product; check archived products too.");
      if (catalog.some(row => row.productId !== product?.productId && productsDuplicate(row, validation.data))) throw new Error("This product name already exists. Matching names require different, non-empty sizes.");

      const response = await fetch("/api/products" + (product ? "/" + product.productId : ""), {
        method: product ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
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
        <div className="min-w-0 space-y-1.5"><FormLabel label="Supplier product code"><Input name="supplierProductCode" value={supplierProductCode} onChange={event => setSupplierProductCode(event.target.value)} aria-invalid={duplicateBarcode} aria-describedby={duplicateBarcode ? markupId + "-barcode-error" : undefined} maxLength={150} placeholder="e.g. BP-TBR-R" /></FormLabel>{duplicateBarcode ? <p id={markupId + "-barcode-error"} role="alert" className="text-xs text-red-600 dark:text-red-400">A product with this barcode already exists. Check archived products too.</p> : <p className="text-xs text-slate-500 dark:text-neutral-400">Enter or correct the code from the supplier invoice.</p>}</div>
        <FormLabel label="Product name" required className="sm:col-span-2"><Input name="name" value={name} onChange={event => setName(event.target.value)} aria-invalid={duplicateProduct} aria-describedby={duplicateProduct ? markupId + "-duplicate-error" : undefined} maxLength={150} required /></FormLabel>
        <FormLabel label="Size"><Input name="size" value={size} onChange={event => setSize(event.target.value)} aria-invalid={duplicateProduct} aria-describedby={duplicateProduct ? markupId + "-duplicate-error" : undefined} maxLength={50} /></FormLabel>
        <FormLabel label="Unit cost (PHP)" required><Input name="unitCost" type="number" min="0" max="9999999999.99" step="0.01" required readOnly={!!product && product.stockQty > 0} value={unitCost} onChange={event => setUnitCost(event.target.value)} />{product && product.stockQty > 0 && <span className="text-xs text-slate-500 dark:text-neutral-400">Calculated from stock receipts. Enter a changed supplier cost on a purchase order.</span>}</FormLabel>
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
        <div className="min-w-0 space-y-1.5"><FormLabel label="Selling price (PHP)" required><Input {...numericInputProps(true)} name="sellingPrice" type="text" pattern="[0-9]{1,10}([.][0-9]{1,2})?" maxLength={13} required value={sellingPrice} aria-invalid={!!priceError} aria-describedby={priceError ? markupId + "-price-error" : undefined} onChange={event => setSellingPrice(event.target.value)} /></FormLabel>{priceError && <p id={markupId + "-price-error"} role="alert" className="text-xs text-red-600 dark:text-red-400">{priceError}</p>}</div>
        {!product && <div className="min-w-0 space-y-1.5"><FormLabel label="Quantity" required><Input name="quantity" type="number" min={0} max={2147483647} step={1} required defaultValue={0} /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">Starting stock on hand. A positive quantity is recorded as an inventory adjustment.</p></div>}
        {product && <><div className="space-y-1.5"><FormLabel label="Availability"><Input value={product.status === "ACTIVE" ? "Active" : "Archived"} readOnly /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">Use product actions to archive or restore.</p></div><div className="min-w-0 space-y-1.5"><FormLabel label="Current stock"><Input value={product.stockQty} readOnly /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">Use Stock Movements to adjust quantity after creation.</p></div></>}
      </fieldset>
      {duplicateProduct && <p id={markupId + "-duplicate-error"} role="alert" className="text-xs text-red-600 dark:text-red-400">This product name already exists. Matching names require different, non-empty sizes.</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={isGuest || isSaving || duplicateProduct || duplicateBarcode || !!priceError} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving..." : product ? "Save changes" : "Create product"}</button>
      </div>
    </form>;
}
