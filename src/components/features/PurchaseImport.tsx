"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleAlert, Plus, Trash2, Upload } from "lucide-react";
import Modal from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";
import { control, iconButton, primaryButton, secondaryButton } from "@/components/ui/feature-styles";
import useMutation from "@/components/ui/use-mutation";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import { numericInputProps } from "@/lib/numeric-input";
import { philippineDate } from "@/lib/feature-list";
import { formatCurrency } from "@/lib/utils";
import { matchImportLine, normalizeImportName, parsePurchaseText, type ImportedPurchaseLine } from "@/lib/purchase-import";
import { readReceipt, maxReceiptSize, receiptTypes } from "@/lib/receipt-ocr";
import type { ContactRow } from "@/types/features";
import type { ProductRow } from "@/types/views";
import { transactionSchema } from "@/validations/shared";
import { purchaseCreateSchema } from "@/validations/purchase-create.schema";
import { createProductSchema, type CreateProductInput } from "@/validations/product.schema";

type InvoiceReviewLine = ImportedPurchaseLine & { newProduct?: CreateProductInput };

export default function PurchaseImport({ parties, products }: { parties: ContactRow[]; products: ProductRow[] }) {
  const [filter, setFilter] = useState<"all" | "review" | "new">("all");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<InvoiceReviewLine[]>([]);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(philippineDate(new Date().toISOString()));
  const [reviewed, setReviewed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const mutation = useMutation();
  const { notify } = useNotifications();
  useEffect(() => () => controller.current?.abort(), []);

  function closeImport() {
    controller.current?.abort();
    controller.current = null;
    setOpen(false);
    setFile(null);
    setFilter("all");
    setLines([]);
    setPartyId("");
    setDate(philippineDate(new Date().toISOString()));
    setReviewed(false);
    setReading(false);
    setProgress("");
    setError("");
    if (fileInput.current) fileInput.current.value = "";
    mutation.clearError();
  }

  function update(index: number, patch: Partial<InvoiceReviewLine>) {
    setLines(current => current.map((line, position) => {
      if (position !== index) return line;
      let warning = line.warning;
      if (patch.productId || patch.newProduct) warning = warning.replace("Select the matching product.", "");
      if (patch.quantity && /^[1-9]\d*$/.test(patch.quantity) && BigInt(patch.quantity) <= 2147483647n) {
        warning = warning.replace("Quantity is missing or unreadable. Enter it from the invoice.", "").replace("Check the quantity.", "");
      }
      if (patch.unitPrice && /^\d+(\.\d{1,2})?$/.test(patch.unitPrice)) warning = warning.replace("Unit price is unreadable. Check the invoice.", "");
      const next = { ...line, ...patch, warning: warning.trim() };
      if (patch.description !== undefined || patch.supplierProductCode !== undefined) {
        Object.assign(next, matchImportLine(next.description, next.supplierProductCode, products));
        // New-product details track OCR corrections until an existing match is selected.
        if (line.newProduct && !next.productId) next.newProduct = { ...line.newProduct, name: next.description, supplierProductCode: next.supplierProductCode };
        else next.newProduct = undefined;
      }
      if (next.productId || next.newProduct) next.warning = next.warning.replace("Select the matching product.", "").trim();
      return next;
    }));
    setReviewed(false);
  }
  function extract(value: string) {
    setFilter("all");
    setLines(parsePurchaseText(value, products).map(line => line.matchStatus === "unmatched" ? { ...line, warning: line.warning.replace("Select the matching product.", "").trim(), newProduct: { name: line.description, supplierProductCode: line.supplierProductCode, size: "", unitCost: line.unitPrice, sellingPrice: "" } } : line));
    const names = value.split(/\r?\n/).map(normalizeImportName);
    const suppliers = parties.filter(party => party.status === "ACTIVE" && names.includes(normalizeImportName(party.name)));
    setPartyId(suppliers.length === 1 ? suppliers[0].id : "");
    const dates = [...new Set(value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];
    if (dates.length === 1 && transactionSchema.shape.date.safeParse(dates[0]).success) setDate(dates[0]);
    setReviewed(false);
  }
  function updateNewProduct(index: number, patch: Partial<CreateProductInput>) {
    const product = lines[index]?.newProduct;
    if (product) update(index, { newProduct: { ...product, ...patch }, ...(patch.unitCost !== undefined ? { unitPrice: patch.unitCost } : {}) });
  }
  async function recognize() {
    if (!file || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setReading(true); setError(""); setProgress("Loading OCR..."); setReviewed(false);
    try {
      const result = await readReceipt(file, message => {
        if (controller.current === abort && !abort.signal.aborted) setProgress(message);
      }, abort.signal);
      if (abort.signal.aborted) return;
      extract(result);
      if (!result.trim()) setError("No text was found. Try a clearer scan or add products manually.");
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to read this invoice. Try a clearer image.");
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setReading(false);
        setProgress("");
      }
    }
  }
  const active = products.filter(product => product.status === "ACTIVE");
  const duplicate = lines.some((line, index) => line.productId && lines.some((other, position) => position !== index && other.productId === line.productId));
  const input = { partyId, date, items: lines.map(line => line.newProduct
    ? { newProduct: line.newProduct, quantity: Number(line.quantity) }
    : { productId: line.productId, quantity: Number(line.quantity) }) };
  const validation = purchaseCreateSchema.safeParse(input);
  const newProductCount = lines.filter(line => line.newProduct).length;
  function needsReview(line: InvoiceReviewLine) {
    return !!line.warning || !/^[1-9]\d*$/.test(line.quantity) || BigInt(line.quantity) > 2147483647n
      || (line.newProduct ? !createProductSchema.safeParse(line.newProduct).success : !line.productId || !["code", "name", "confirmed"].includes(line.matchStatus));
  }
  const reviewCount = lines.filter(needsReview).length;
  const unconfirmed = lines.some(line => !line.newProduct && (!line.productId || !["code", "name", "confirmed"].includes(line.matchStatus)));
  const total = lines.reduce((sum, line) => sum + (line.newProduct ? Number(line.newProduct.unitCost) || 0 : products.find(product => product.productId === line.productId)?.unitCost ?? 0) * (Number(line.quantity) || 0), 0);

  return <>
    <button type="button" className={secondaryButton} onClick={() => { mutation.clearError(); setOpen(true); }}><Upload className="size-4" />Import Receipt / Invoice</button>
    <Modal open={open} wide busy={mutation.saving} title="Import purchase receipt or invoice" onClose={closeImport}>
      <form className="mt-5 space-y-5" onSubmit={event => {
        event.preventDefault();
        if (reading || !reviewed || unconfirmed) return;
        if (!validation.success) { setError(validation.error.issues[0].message); return; }
        setError("");
        void mutation.submit("/api/purchases", "POST", validation.data, () => { closeImport(); notify(newProductCount ? `Purchase saved with ${newProductCount} new product${newProductCount === 1 ? "" : "s"}. Receive the purchase to add stock.` : "Imported pending purchase order saved successfully."); });
      }}>
        <p className="text-sm text-slate-500 dark:text-neutral-400">Import a receipt photo or invoice PDF. Match each line to an existing product or choose Create new product. Existing products use stored costs; review the cost and selling price for each new product before saving.</p>
        <fieldset disabled={reading || mutation.saving} className="space-y-5">
          <FormLabel label="Receipt or invoice file" className="gap-2"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={event => {
            const selected = event.target.files?.[0]; setError(""); setFilter("all"); setLines([]); setReviewed(false);
            if (selected && (!receiptTypes.includes(selected.type) || !selected.size || selected.size > maxReceiptSize)) { setError("Choose a PNG, JPEG, WebP or PDF under 20 MB."); setFile(null); return; }
            setFile(selected ?? null);
          }} className="block w-full min-w-0 rounded-lg border border-slate-200 p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:file:cursor-not-allowed disabled:file:opacity-50 dark:border-neutral-700" /></FormLabel>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Up to 20 MB and 10 PDF pages. OCR runs on this device; the document is not uploaded or retained.</p>
          <button type="button" className={secondaryButton} disabled={!file} onClick={() => void recognize()}>Read with OCR</button>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Review the description, quantity and unit price below. Barcode and discount columns are separated from product details. Missing quantities stay blank. Include every column in a clear, flat photo and check for skipped products.</p>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Invoice edits update matching and new product details. To change an existing catalog product’s name or supplier code, edit it in Products.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormLabel label="Supplier" required><select className={control} required value={partyId} onChange={event => { setPartyId(event.target.value); setReviewed(false); }}><option value="">Select supplier</option>{parties.filter(party => party.status === "ACTIVE").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></FormLabel>
            <FormLabel label="Purchase date" required><input type="date" required className={control} value={date} onChange={event => { setDate(event.target.value); setReviewed(false); }} /></FormLabel>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Review products ({lines.length})</h3><button type="button" className={secondaryButton} disabled={lines.length >= 100} onClick={() => { setLines(current => [...current, { description: "", supplierProductCode: "", matchStatus: "unmatched", productId: "", quantity: "1", unitPrice: "", warning: "" }]); setFilter("all"); setReviewed(false); }}><Plus className="size-4" />Add product</button></div>
          <div role="group" aria-label="Filter invoice products" className="grid grid-cols-3 gap-1 rounded-full bg-slate-100 p-1 dark:bg-neutral-800">{([ ["all", "All items", lines.length], ["review", "Needs review", reviewCount], ["new", "New only", newProductCount] ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} className={"rounded-full px-2 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-violet-500 " + (filter === value ? "bg-white text-violet-700 shadow-sm dark:bg-neutral-700 dark:text-violet-300" : "text-slate-600 dark:text-neutral-300")} onClick={() => setFilter(value)}>{label} ({count})</button>)}</div>
          {!lines.length && <p className="text-sm text-slate-500 dark:text-neutral-400">No products extracted yet. Read a file or add products manually.</p>}
          {lines.length > 0 && !lines.some(line => filter === "all" || (filter === "new" ? !!line.newProduct : needsReview(line))) && <p role="status" className="text-sm text-slate-500">No items in this filter.</p>}
          {lines.map((line, index) => {
            const matchedProduct = products.find(product => product.productId === line.productId);
            const matched = !!matchedProduct && ["code", "name", "confirmed"].includes(line.matchStatus);
            const validQuantity = /^[1-9]\d*$/.test(line.quantity) && BigInt(line.quantity) <= 2147483647n;
            const quantityErrorId = `invoice-quantity-error-${index}`;
            const reviewWarning = line.warning.replace("Quantity is missing or unreadable. Enter it from the invoice.", "").replace("Check the quantity.", "").trim();
            const quantityField = <FormLabel label={`Quantity ${index + 1}`} required className="text-xs"><input {...numericInputProps()} type="number" required min={1} max={2147483647} step={1} className={control} value={line.quantity} placeholder="Required" aria-invalid={!validQuantity} aria-describedby={validQuantity ? undefined : quantityErrorId} onChange={event => update(index, { quantity: event.target.value })} /></FormLabel>;
            const unitCostField = <FormLabel label={`Unit cost ${index + 1} (PHP)`} required={!!line.newProduct} className="text-xs"><input {...numericInputProps(true)} type="number" required={!!line.newProduct} min={0} max="9999999999.99" step="0.01" className={control} value={line.newProduct?.unitCost ?? line.unitPrice} onChange={event => line.newProduct ? updateNewProduct(index, { unitCost: event.target.value }) : update(index, { unitPrice: event.target.value })} /></FormLabel>;
            const nameField = <FormLabel label={`Product name ${index + 1}`} required={!!line.newProduct} className="text-xs sm:col-span-2"><input type="text" required={!!line.newProduct} maxLength={line.newProduct ? 150 : 1000} className={control} value={line.description} onChange={event => update(index, { description: event.target.value })} /></FormLabel>;
            const codeField = <div className="min-w-0 space-y-1.5 sm:col-span-2"><FormLabel label={`Supplier product code ${index + 1}`} className="text-xs"><input maxLength={150} className={control} value={line.supplierProductCode} onChange={event => update(index, { supplierProductCode: event.target.value })} placeholder="e.g. BP-TBR-R" /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">From the invoice BARCODE column.</p></div>;
            return <div key={index} hidden={filter === "new" ? !line.newProduct : filter === "review" && !needsReview(line)} className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-neutral-700">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><h4 className="break-words font-semibold">{matched ? matchedProduct?.name : line.description || "New product"}</h4><p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">Invoice line {index + 1}</p></div>
              <div className="flex shrink-0 items-center gap-2"><span className={"rounded-full px-2 py-1 text-xs font-medium " + (line.newProduct ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : matched ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300")}>{line.newProduct ? "New product" : matched ? "Matched" : "Review match"}</span><button type="button" className={iconButton} aria-label={"Remove imported product " + (index + 1)} onClick={() => { setLines(current => current.filter((_, position) => position !== index)); setReviewed(false); }}><Trash2 className="size-4" /></button></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{quantityField}{unitCostField}</div>
              <FormLabel label={`Product match ${index + 1}`} required className="text-xs"><select required className={control} value={line.newProduct ? "new" : line.matchStatus === "suggested" ? "suggested" : line.productId} onChange={event => {
                if (event.target.value === "suggested") return;
                update(index, event.target.value === "new"
                ? { productId: "", matchStatus: "confirmed", newProduct: { name: line.description, supplierProductCode: line.supplierProductCode, size: "", unitCost: line.unitPrice, sellingPrice: "" } }
                : { productId: event.target.value, matchStatus: "confirmed", newProduct: undefined });
              }}><option value="">Select product</option>{line.matchStatus === "suggested" && <option value="suggested">Suggested match — needs confirmation</option>}<option value="new">+ Create new product</option>{active.map(product => <option key={product.productId} value={product.productId}>{line.productId === product.productId ? "Existing catalog product" : product.name + (product.supplierProductCode ? ` (${product.supplierProductCode})` : "")}</option>)}</select></FormLabel>
            {line.matchStatus === "ambiguous" && <p className="text-xs text-amber-700 dark:text-amber-400">Several active products match these details. Select the correct product.</p>}
            {line.newProduct ? <details aria-label={`New product details ${index + 1}`} className="group space-y-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 [&::-webkit-details-marker]:hidden"><span className="group-open:hidden">Set up new product</span><span className="hidden group-open:inline">Hide new product details</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
              <div className="grid items-start gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 dark:bg-neutral-800/40 [&>label]:min-w-0 [&_input]:min-w-0">
                {nameField}{codeField}
                <FormLabel label={`Size ${index + 1}`} className="text-xs sm:col-span-2"><input maxLength={50} className={control} value={line.newProduct.size ?? ""} onChange={event => updateNewProduct(index, { size: event.target.value })} placeholder="e.g. Medium" /></FormLabel>
                <FormLabel label={`Selling price ${index + 1} (PHP)`} required className="text-xs sm:col-span-2"><input {...numericInputProps(true)} type="number" required min={0} max="9999999999.99" step="0.01" className={control} value={line.newProduct.sellingPrice} onChange={event => updateNewProduct(index, { sellingPrice: event.target.value })} placeholder="Enter selling price" /></FormLabel>
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400">SKU is assigned when the purchase is saved. The new product and pending purchase save together; stock is added when the purchase is received.</p>
            </details> : <details className="space-y-3 rounded-lg border border-slate-100 p-3 dark:border-neutral-800"><summary className="cursor-pointer text-xs font-medium">Invoice details and corrections</summary>{line.matchStatus === "suggested" && <div className="space-y-2 text-xs text-blue-700 dark:text-blue-300"><p>Suggested product: {matchedProduct?.name}. Choose Existing catalog product from Product match to confirm.</p><p>Invoice code: {line.supplierProductCode || "Not read"}. Catalog code: {matchedProduct?.supplierProductCode || "Not set"}.</p></div>}<div className="grid gap-3 sm:grid-cols-2">{nameField}{codeField}</div>{matchedProduct && <p className="text-xs text-slate-500 dark:text-neutral-400">Stored unit cost: {formatCurrency(matchedProduct.unitCost)}. The unit cost above is an invoice reference; this purchase uses the stored cost.</p>}</details>}
            {!validQuantity && <p id={quantityErrorId} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />Enter a valid quantity before saving.</p>}
            {line.newProduct && validQuantity && !createProductSchema.safeParse(line.newProduct).success && <p className="text-xs text-amber-700 dark:text-amber-400">Complete the new product details before saving.</p>}
            {reviewWarning && <p className="text-xs text-amber-700 dark:text-amber-400">{reviewWarning}</p>}
          </div>;
          })}
          {duplicate && <p className="text-sm text-red-600">Each product can appear only once. Combine quantities for repeated products.</p>}
          {lines.length > 100 && <p className="text-sm text-red-600">An order supports up to 100 products. Split this invoice into separate orders.</p>}
          <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30"><p className="font-semibold">Estimated purchase total: {formatCurrency(total)}</p><p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">The server recalculates the total using stored costs and the reviewed costs of new products. Saving creates a pending purchase; stock changes only after receiving it.</p>{newProductCount > 0 && <p className="mt-2 text-sm">{newProductCount} new product{newProductCount === 1 ? "" : "s"} will be added to Products when saved.</p>}</div>
          {reviewed && !validation.success && <p role="alert" className="text-sm text-red-600">{validation.error.issues[0]?.message ?? "Check all product details before saving."}</p>}
          <FormLabel label="I checked every invoice line, matched or prepared new products, and verified quantities, costs, selling prices, supplier and date." required className="flex! items-start gap-2 font-normal"><input type="checkbox" required checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="order-first mt-1 accent-violet-600" /></FormLabel>
          {unconfirmed && <p className="text-sm text-amber-700 dark:text-amber-400">Confirm suggested matches or choose a product for every unresolved line.</p>}
          <div className="flex justify-end"><button type="submit" className={primaryButton} disabled={!reviewed || !validation.success || unconfirmed}>{mutation.saving ? "Saving..." : "Create pending purchase"}</button></div>
        </fieldset>
        {reading && <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><span>{progress}</span><button type="button" className={secondaryButton} onClick={() => controller.current?.abort()}>Cancel OCR</button></div>}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Modal>
  </>;
}
