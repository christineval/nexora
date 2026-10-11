"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import type { ProductRow } from "@/types/views";
import FormLabel from "../ui/FormLabel";
import { useNotifications } from "@/components/ui/SnackbarProvider";

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
    const lock = useRef(false);
    const { notify, dismiss } = useNotifications();

    const sku = product?.sku ?? nextSku ?? ""; 

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
          size: String(formData.get("size") ?? ""),
          unitCost: formData.get("unitCost"),
          sellingPrice: formData.get("sellingPrice"),
          ...(product ? { status: formData.get("status") } : {}),
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
      <fieldset disabled={isSaving} className="grid gap-4 sm:grid-cols-2">
        <FormLabel label="SKU" required><Input name="sku" value={sku || "Assigned when saved"} readOnly /></FormLabel>
        <FormLabel label="Product name" required><Input name="name" defaultValue={product?.name} maxLength={150} required /></FormLabel>
        <FormLabel label="Size"><Input name="size" defaultValue={product?.size ?? ""} maxLength={50} /></FormLabel>
        <FormLabel label="Unit cost (PHP)" required><Input name="unitCost" type="number" min="0" step="0.01" required defaultValue={product?.unitCost} /></FormLabel>
        <FormLabel label="Selling price (PHP)" required><Input name="sellingPrice" type="number" min="0" step="0.01" required defaultValue={product?.sellingPrice} /></FormLabel>
        {product && <><FormLabel label="Status"><select name="status" defaultValue={product.status} className="rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"><option>ACTIVE</option><option>INACTIVE</option><option>DISCONTINUED</option></select></FormLabel><FormLabel label="Current stock"><Input value={product.stockQty} readOnly /><span className="text-xs font-normal text-slate-500 dark:text-neutral-400">Stock changes belong in stock movements.</span></FormLabel></>}
      </fieldset>
      <div className="flex justify-end">
        <button type="submit" disabled={isSaving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving..." : product ? "Save changes" : "Create product"}</button>
      </div>
    </form>;
}
