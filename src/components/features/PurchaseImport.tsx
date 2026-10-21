"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import Modal from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";
import { control, iconButton, primaryButton, secondaryButton } from "@/components/ui/feature-styles";
import useMutation from "@/components/ui/use-mutation";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import { numericInputProps } from "@/lib/numeric-input";
import { philippineDate } from "@/lib/feature-list";
import { formatCurrency } from "@/lib/utils";
import { normalizeImportName, parsePurchaseText, type ImportedPurchaseLine } from "@/lib/purchase-import";
import { readReceipt, maxReceiptSize, receiptTypes } from "@/lib/receipt-ocr";
import type { ContactRow } from "@/types/features";
import type { ProductRow } from "@/types/views";
import { transactionSchema } from "@/validations/shared";
import { purchaseCreateSchema } from "@/validations/purchase-create.schema";
import type { CreateProductInput } from "@/validations/product.schema";

type InvoiceReviewLine = ImportedPurchaseLine & { newProduct?: CreateProductInput };

export default function PurchaseImport({ parties, products }: { parties: ContactRow[]; products: ProductRow[] }) {
  const textId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
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
    setText("");
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
      return { ...line, ...patch, warning: warning.trim() };
    }));
    setReviewed(false);
  }
  function extract(value: string) {
    setLines(parsePurchaseText(value, products));
    const names = value.split(/\r?\n/).map(normalizeImportName);
    const suppliers = parties.filter(party => party.status === "ACTIVE" && names.includes(normalizeImportName(party.name)));
    setPartyId(suppliers.length === 1 ? suppliers[0].id : "");
    const dates = [...new Set(value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];
    if (dates.length === 1 && transactionSchema.shape.date.safeParse(dates[0]).success) setDate(dates[0]);
    setReviewed(false);
  }
  function updateNewProduct(index: number, patch: Partial<CreateProductInput>) {
    const product = lines[index]?.newProduct;
    if (product) update(index, { newProduct: { ...product, ...patch } });
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
      setText(result); extract(result);
      if (!result.trim()) setError("No text was found. Try a clearer scan or paste the invoice text below.");
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
  const total = lines.reduce((sum, line) => sum + (line.newProduct ? Number(line.newProduct.unitCost) || 0 : products.find(product => product.productId === line.productId)?.unitCost ?? 0) * (Number(line.quantity) || 0), 0);

  return <>
    <button type="button" className={secondaryButton} onClick={() => { mutation.clearError(); setOpen(true); }}><Upload className="size-4" />Import Receipt / Invoice</button>
    <Modal open={open} wide busy={mutation.saving} title="Import purchase receipt or invoice" onClose={closeImport}>
      <form className="mt-5 space-y-5" onSubmit={event => {
        event.preventDefault();
        if (reading || !reviewed) return;
        if (!validation.success) { setError(validation.error.issues[0].message); return; }
        setError("");
        void mutation.submit("/api/purchases", "POST", validation.data, () => { closeImport(); notify(newProductCount ? `Purchase saved with ${newProductCount} new product${newProductCount === 1 ? "" : "s"}. Receive the purchase to add stock.` : "Imported pending purchase order saved successfully."); });
      }}>
        <p className="text-sm text-slate-500 dark:text-neutral-400">Import a receipt photo or invoice PDF. Match each line to an existing product or choose Create new product. Existing products use stored costs; review the cost and selling price for each new product before saving.</p>
        <fieldset disabled={reading || mutation.saving} className="space-y-5">
          <FormLabel label="Receipt or invoice file" className="gap-2"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={event => {
            const selected = event.target.files?.[0]; setError(""); setText(""); setLines([]); setReviewed(false);
            if (selected && (!receiptTypes.includes(selected.type) || !selected.size || selected.size > maxReceiptSize)) { setError("Choose a PNG, JPEG, WebP or PDF under 20 MB."); setFile(null); return; }
            setFile(selected ?? null);
          }} className="block w-full min-w-0 rounded-lg border border-slate-200 p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:file:cursor-not-allowed disabled:file:opacity-50 dark:border-neutral-700" /></FormLabel>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Up to 20 MB and 10 PDF pages. OCR runs on this device; the document is not uploaded or retained.</p>
          <button type="button" className={secondaryButton} disabled={!file} onClick={() => void recognize()}>Read with OCR</button>
          <details className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-neutral-700">
            <summary className="cursor-pointer text-sm font-medium">View or paste invoice text</summary>
            <div className="grid gap-2"><FormLabel label="Extracted invoice text" htmlFor={textId}>{null}</FormLabel><textarea id={textId} className={control + " h-36 py-2 font-mono"} value={text} maxLength={100000} onChange={event => { setText(event.target.value); setReviewed(false); }} placeholder="OCR text appears here. You can also paste invoice text." /></div>
            <button type="button" className={secondaryButton} disabled={!text.trim()} onClick={() => { extract(text); setError(""); }}>Extract product lines</button>
          </details>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Review the description, quantity and unit price below. Barcode and discount columns are separated from product details. Missing quantities stay blank. Include every column in a clear, flat photo and check for skipped products.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormLabel label="Supplier" required><select className={control} required value={partyId} onChange={event => { setPartyId(event.target.value); setReviewed(false); }}><option value="">Select supplier</option>{parties.filter(party => party.status === "ACTIVE").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></FormLabel>
            <FormLabel label="Purchase date" required><input type="date" required className={control} value={date} onChange={event => { setDate(event.target.value); setReviewed(false); }} /></FormLabel>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Review products ({lines.length})</h3><button type="button" className={secondaryButton} disabled={lines.length >= 100} onClick={() => { setLines(current => [...current, { description: "", productId: "", quantity: "1", unitPrice: "", warning: "Added manually. Check against the invoice." }]); setReviewed(false); }}><Plus className="size-4" />Add product</button></div>
          {!lines.length && <p className="text-sm text-slate-500 dark:text-neutral-400">No products extracted yet. Read a file, paste text or add products manually.</p>}
          {lines.map((line, index) => <div key={index} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-neutral-700">
            <div className="flex items-start justify-between gap-2"><FormLabel label={`Invoice description ${index + 1}`} className="flex-1 text-xs"><input type="text" maxLength={1000} className={control} value={line.description} onChange={event => update(index, { description: event.target.value })} /></FormLabel><button type="button" className={iconButton} aria-label={"Remove imported product " + (index + 1)} onClick={() => { setLines(current => current.filter((_, position) => position !== index)); setReviewed(false); }}><Trash2 className="size-4" /></button></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormLabel label={`Matched product ${index + 1}`} required className="text-xs"><select required className={control} value={line.newProduct ? "new" : line.productId} onChange={event => update(index, event.target.value === "new"
                ? { productId: "", newProduct: { name: line.description, size: "", unitCost: line.unitPrice, sellingPrice: "" } }
                : { productId: event.target.value, newProduct: undefined })}><option value="">Select product</option><option value="new">+ Create new product</option>{active.map(product => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></FormLabel>
              <FormLabel label={`Quantity ${index + 1}`} required className="text-xs"><input {...numericInputProps()} type="number" required min={1} max={2147483647} step={1} className={control} value={line.quantity} onChange={event => update(index, { quantity: event.target.value })} /></FormLabel>
              <FormLabel label={`Invoice unit price ${index + 1} (reference)`} className="text-xs"><input {...numericInputProps(true)} type="number" min={0} step="0.01" className={control} value={line.unitPrice} onChange={event => update(index, { unitPrice: event.target.value })} /></FormLabel>
            </div>
            {line.newProduct && <div className="space-y-3 rounded-lg bg-violet-50 p-3 dark:bg-violet-950/30">
              <p className="text-sm font-medium">New product — SKU assigned when saved</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormLabel label={`New product name ${index + 1}`} required className="text-xs"><input required maxLength={150} className={control} value={line.newProduct.name} onChange={event => updateNewProduct(index, { name: event.target.value })} /></FormLabel>
                <FormLabel label={`New product size ${index + 1}`} className="text-xs"><input maxLength={50} className={control} value={line.newProduct.size ?? ""} onChange={event => updateNewProduct(index, { size: event.target.value })} /></FormLabel>
                <FormLabel label={`New product unit cost ${index + 1}`} required className="text-xs"><input {...numericInputProps(true)} type="number" required min={0} max="9999999999.99" step="0.01" className={control} value={line.newProduct.unitCost} onChange={event => updateNewProduct(index, { unitCost: event.target.value })} /></FormLabel>
                <FormLabel label={`New product selling price ${index + 1}`} required className="text-xs"><input {...numericInputProps(true)} type="number" required min={0} max="9999999999.99" step="0.01" className={control} value={line.newProduct.sellingPrice} onChange={event => updateNewProduct(index, { sellingPrice: event.target.value })} /></FormLabel>
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400">This product is added when you save the purchase. Starting stock is zero until the purchase is received.</p>
            </div>}
            {line.warning && <p className="text-xs text-amber-700 dark:text-amber-400">{line.warning}</p>}
            {line.productId && <p className="text-xs text-slate-500 dark:text-neutral-400">Stored unit cost: {formatCurrency(products.find(product => product.productId === line.productId)?.unitCost ?? 0)}</p>}
          </div>)}
          {duplicate && <p className="text-sm text-red-600">Each product can appear only once. Combine quantities for repeated products.</p>}
          {lines.length > 100 && <p className="text-sm text-red-600">An order supports up to 100 products. Split this invoice into separate orders.</p>}
          <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30"><p className="font-semibold">Estimated purchase total: {formatCurrency(total)}</p><p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">The server recalculates the total using stored costs and the reviewed costs of new products. Saving creates a pending purchase; stock changes only after receiving it.</p>{newProductCount > 0 && <p className="mt-2 text-sm">{newProductCount} new product{newProductCount === 1 ? "" : "s"} will be added to Products when saved.</p>}</div>
          {reviewed && !validation.success && <p role="alert" className="text-sm text-red-600">{validation.error.issues[0]?.message ?? "Check all product details before saving."}</p>}
          <FormLabel label="I checked every invoice line, matched or prepared new products, and verified quantities, costs, selling prices, supplier and date." required className="flex! items-start gap-2 font-normal"><input type="checkbox" required checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="order-first mt-1 accent-violet-600" /></FormLabel>
          <div className="flex justify-end"><button type="submit" className={primaryButton} disabled={!reviewed || !validation.success}>{mutation.saving ? "Saving..." : "Create pending purchase"}</button></div>
        </fieldset>
        {reading && <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><span>{progress}</span><button type="button" className={secondaryButton} onClick={() => controller.current?.abort()}>Cancel OCR</button></div>}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Modal>
  </>;
}
