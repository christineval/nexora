"use client";
import { useGuestPreview } from "@/components/ui/GuestPreviewProvider";
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
import { validationMessages } from "@/lib/validation-errors";
import { matchImportLine, normalizeImportName, parsePurchaseText, type ImportedPurchaseLine } from "@/lib/purchase-import";
import { readReceipt, maxReceiptSize, receiptTypes } from "@/lib/receipt-ocr";
import type { ContactRow } from "@/types/features";
import type { ProductRow } from "@/types/views";
import { calendarDateSchema } from "@/validations/shared";
import { purchaseCreateSchema, purchaseQuantitySchema } from "@/validations/purchase-create.schema";
import { createProductSchema, type CreateProductInput } from "@/validations/product.schema";
import { suggestSellingPrice } from "@/lib/money";
import { productBarcodesDuplicate, productsDuplicate } from "@/lib/record-identity";

type InvoiceReviewLine = ImportedPurchaseLine & { newProduct?: CreateProductInput; markupPercent?: string };

function quantityError(value: string) {
  if (!value.trim()) return "Enter a quantity for this invoice line.";
  const parsed = purchaseQuantitySchema.safeParse(Number(value));
  return parsed.success ? "" : parsed.error.issues[0].message;
}

export default function PurchaseImport({ parties, products }: { parties: ContactRow[]; products: ProductRow[] }) {
  const isGuest = useGuestPreview();
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
  const importKey = useRef<string | null>(null);
  const mutation = useMutation();
  const { notify } = useNotifications();
  useEffect(() => () => controller.current?.abort(), []);

  function closeImport() {
    controller.current?.abort();
    controller.current = null;
    importKey.current = null;
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
      if (patch.quantity !== undefined && !quantityError(patch.quantity)) {
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
    const parsed = parsePurchaseText(value, products);
    setLines(parsed.map(line => line.matchStatus === "unmatched" ? { ...line, warning: line.warning.replace("Select the matching product.", "").trim(), newProduct: { name: line.description, supplierProductCode: line.supplierProductCode, size: "", unitCost: line.unitPrice, sellingPrice: "" } } : line));
    const names = value.split(/\r?\n/).map(normalizeImportName);
    const suppliers = parties.filter(party => party.status === "ACTIVE" && names.includes(normalizeImportName(party.name)));
    setPartyId(suppliers.length === 1 ? suppliers[0].id : "");
    const dates = [...new Set(value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];
    if (dates.length === 1 && calendarDateSchema.safeParse(dates[0]).success) setDate(dates[0]);
    setReviewed(false);
    return parsed.length;
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
      const count = extract(result);
      if (!count) setError(result.trim()
        ? "Text was read, but no product rows were recognized. Try a clearer photo showing every column, or add products manually."
        : "No text was found. Try a clearer scan or add products manually.");
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
    : { productId: line.productId, quantity: Number(line.quantity), unitPrice: line.unitPrice }) };
  const validation = purchaseCreateSchema.safeParse(input);
  const catalogBarcodeDuplicates = lines.map(line => {
    const newProduct = line.newProduct;
    return !!newProduct && products.some(product => productBarcodesDuplicate(product, newProduct));
  });
  const catalogDuplicates = lines.map((line, index) => {
    const newProduct = line.newProduct;
    return catalogBarcodeDuplicates[index] || (!!newProduct && products.some(product => productsDuplicate(product, newProduct)));
  });
  const errors = [...(validation.success ? [] : validationMessages(validation.error.issues)), ...catalogDuplicates.flatMap((duplicate, index) => duplicate ? [`Invoice line ${index + 1}: ${catalogBarcodeDuplicates[index] ? "A product with this barcode already exists." : "This product name already exists. Matching names require different, non-empty sizes."} Select the catalog product; check archived products too.`] : [])];
  const supplierError = !validation.success && validation.error.issues.find(issue => issue.path[0] === "partyId")?.message;
  const dateError = !validation.success && validation.error.issues.find(issue => issue.path[0] === "date")?.message;
  const newProductCount = lines.filter(line => line.newProduct).length;
  function isExistingProductLine(line: InvoiceReviewLine) {
    return !line.newProduct && (!!line.productId || line.matchStatus === "suggested" || line.matchStatus === "ambiguous");
  }
  const reviewCount = lines.filter(isExistingProductLine).length;
  const unconfirmed = lines.some(line => !line.newProduct && (!line.productId || !["code", "name", "confirmed"].includes(line.matchStatus)));
  const total = lines.reduce((sum, line) => sum + (Number(line.newProduct?.unitCost ?? line.unitPrice) || 0) * (Number(line.quantity) || 0), 0);

  return <>
    <button type="button" className={secondaryButton} onClick={() => { mutation.clearError(); setOpen(true); }}><Upload className="size-4" />Import Receipt / Invoice</button>
    <Modal open={open} wide busy={mutation.saving} title="Import purchase receipt or invoice" onClose={closeImport}>
      <form className="mt-5 space-y-5" onSubmit={event => {
        event.preventDefault();
        if (isGuest || reading || !reviewed || unconfirmed) return;
        if (!validation.success) { setError(errors[0]); return; }
        if (catalogDuplicates.some(Boolean)) { setError(errors[0]); return; }
        setError("");
        importKey.current ??= crypto.randomUUID();
        void mutation.submit("/api/purchases/import", "POST", { ...validation.data, importKey: importKey.current }, () => { closeImport(); notify(newProductCount ? `Received purchase saved with ${newProductCount} new product${newProductCount === 1 ? "" : "s"}. Stock has been updated.` : "Received purchase saved. Stock has been updated."); });
      }}>
        <p className="text-sm text-slate-500 dark:text-neutral-400">Import an invoice for goods already received. Match each line to an existing product or create a new product. Review the actual invoice unit costs. Saving records a received purchase, adds stock and records the amount owed to the supplier; it does not record payment.</p>
        {reading && <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><span>{progress}</span><button type="button" className={secondaryButton} onClick={() => controller.current?.abort()}>Cancel OCR</button></div>}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <fieldset disabled={reading || mutation.saving} className="space-y-5">
          <FormLabel label="Receipt or invoice file" className="gap-2"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={event => {
            const selected = event.target.files?.[0]; setError(""); setFilter("all"); setLines([]); setReviewed(false);
            importKey.current = null;
            if (selected && (!receiptTypes.includes(selected.type) || !selected.size || selected.size > maxReceiptSize)) { setError("Choose a PNG, JPEG, WebP or PDF under 20 MB."); setFile(null); return; }
            setFile(selected ?? null);
          }} className="block w-full min-w-0 rounded-lg border border-slate-200 p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:file:cursor-not-allowed disabled:file:opacity-50 dark:border-neutral-700" /></FormLabel>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Up to 20 MB and 10 PDF pages. OCR runs on this device; the document is not uploaded or retained.</p>
          <button type="button" className={secondaryButton} disabled={!file} onClick={() => void recognize()}>Read with OCR</button>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Review the description, quantity and unit price below. Barcode and discount columns are separated from product details. Missing quantities stay blank. Include every column in a clear, flat photo and check for skipped products.</p>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Invoice edits update matching and new product details. To change an existing catalog product’s name or supplier code, edit it in Products.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><FormLabel label="Supplier" required><select className={control} required value={partyId} aria-invalid={reviewed && !!supplierError} aria-describedby={reviewed && supplierError ? "invoice-supplier-error" : undefined} onChange={event => { setPartyId(event.target.value); setReviewed(false); }}><option value="">Select supplier</option>{parties.filter(party => party.status === "ACTIVE").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></FormLabel>{reviewed && supplierError && <p id="invoice-supplier-error" className="text-xs text-red-600 dark:text-red-400">{supplierError}</p>}</div>
            <div className="space-y-1.5"><FormLabel label="Purchase date" required><input type="date" max={philippineDate(new Date().toISOString())} required className={control} value={date} aria-invalid={reviewed && !!dateError} aria-describedby={reviewed && dateError ? "invoice-date-error" : undefined} onChange={event => { setDate(event.target.value); setReviewed(false); }} /></FormLabel>{reviewed && dateError && <p id="invoice-date-error" className="text-xs text-red-600 dark:text-red-400">{dateError}</p>}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Review products ({lines.length})</h3><button type="button" className={secondaryButton} disabled={lines.length >= 100} onClick={() => { setLines(current => [...current, { description: "", supplierProductCode: "", matchStatus: "unmatched", productId: "", quantity: "1", unitPrice: "", warning: "" }]); setFilter("all"); setReviewed(false); }}><Plus className="size-4" />Add product</button></div>
          <div role="group" aria-label="Filter invoice products" className="grid grid-cols-3 gap-1 rounded-full bg-slate-100 p-1 dark:bg-neutral-800">{([ ["all", "All items", lines.length], ["review", "Needs review", reviewCount], ["new", "New only", newProductCount] ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} className={"rounded-full px-2 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-violet-500 " + (filter === value ? "bg-white text-violet-700 shadow-sm dark:bg-neutral-700 dark:text-violet-300" : "text-slate-600 dark:text-neutral-300")} onClick={() => setFilter(value)}>{label} ({count})</button>)}</div>
          {!lines.length && <p className="text-sm text-slate-500 dark:text-neutral-400">No products extracted yet. Read a file or add products manually.</p>}
          {lines.length > 0 && !lines.some(line => filter === "all" || (filter === "new" ? !!line.newProduct : isExistingProductLine(line))) && <p role="status" className="text-sm text-slate-500">No items in this filter.</p>}
          {lines.map((line, index) => {
            const matchedProduct = products.find(product => product.productId === line.productId);
            const matched = !!matchedProduct && ["code", "name", "confirmed"].includes(line.matchStatus);
            const quantityMessage = quantityError(line.quantity);
            const validQuantity = !quantityMessage;
            const productValidation = line.newProduct ? createProductSchema.safeParse(line.newProduct) : undefined;
            const markup = line.markupPercent ?? "30";
            const suggestedPrice = line.newProduct && markup !== "" ? suggestSellingPrice(line.newProduct.unitCost, Number(markup)) : null;
            const quantityErrorId = `invoice-quantity-error-${index}`;
            const reviewWarning = line.warning.replace("Quantity is missing or unreadable. Enter it from the invoice.", "").replace("Check the quantity.", "").trim();
            const quantityField = <FormLabel label={`Quantity ${index + 1}`} required className="text-xs"><input {...numericInputProps()} type="number" required min={1} max={2147483647} step={1} className={control} value={line.quantity} placeholder="Required" aria-invalid={!validQuantity} aria-describedby={validQuantity ? undefined : quantityErrorId} onChange={event => update(index, { quantity: event.target.value })} /></FormLabel>;
            const unitCostField = <FormLabel label={`Unit cost ${index + 1} (PHP)`} required className="text-xs"><input {...numericInputProps(true)} type="number" required min={0} max="9999999999.99" step="0.01" className={control} value={line.newProduct?.unitCost ?? line.unitPrice} onChange={event => line.newProduct ? updateNewProduct(index, { unitCost: event.target.value }) : update(index, { unitPrice: event.target.value })} /></FormLabel>;
            const nameField = <FormLabel label={`Product name ${index + 1}`} required={!!line.newProduct} className="text-xs sm:col-span-2"><input type="text" required={!!line.newProduct} maxLength={line.newProduct ? 150 : 1000} className={control} value={line.description} onChange={event => update(index, { description: event.target.value })} /></FormLabel>;
            const codeField = <div className="min-w-0 space-y-1.5 sm:col-span-2"><FormLabel label={`Supplier product code ${index + 1}`} className="text-xs"><input maxLength={150} className={control} value={line.supplierProductCode} onChange={event => update(index, { supplierProductCode: event.target.value })} placeholder="e.g. BP-TBR-R" /></FormLabel><p className="text-xs text-slate-500 dark:text-neutral-400">From the invoice BARCODE column.</p></div>;
            return <div key={index} hidden={filter === "new" ? !line.newProduct : filter === "review" && !isExistingProductLine(line)} className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-neutral-700">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><h4 className="break-words font-semibold">{matched ? matchedProduct?.name : line.description || "New product"}</h4><p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">Invoice line {index + 1}</p></div>
              <div className="flex shrink-0 items-center gap-2"><span className={"rounded-full px-2 py-1 text-xs font-medium " + (line.newProduct ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : matched ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300")}>{line.newProduct ? "New product" : matched ? "Matched" : "Review match"}</span><button type="button" className={iconButton} aria-label={"Remove imported product " + (index + 1)} onClick={() => { setLines(current => current.filter((_, position) => position !== index)); setReviewed(false); }}><Trash2 className="size-4" /></button></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{quantityField}{unitCostField}
              <FormLabel label={`Product match ${index + 1}`} required className="col-span-2 text-xs sm:col-span-1"><select required className={control} value={line.newProduct ? "new" : line.matchStatus === "suggested" ? "suggested" : line.productId} onChange={event => {
                if (event.target.value === "suggested") return;
                update(index, event.target.value === "new"
                ? { productId: "", matchStatus: "confirmed", newProduct: { name: line.description, supplierProductCode: line.supplierProductCode, size: "", unitCost: line.unitPrice, sellingPrice: "" } }
                : { productId: event.target.value, matchStatus: "confirmed", newProduct: undefined });
              }}><option value="">Select product</option>{line.matchStatus === "suggested" && <option value="suggested">Suggested match — needs confirmation</option>}<option value="new">+ Create new product</option>{active.map(product => <option key={product.productId} value={product.productId}>{line.productId === product.productId ? "Existing catalog product" : product.name + (product.supplierProductCode ? ` (${product.supplierProductCode})` : "")}</option>)}</select></FormLabel></div>
            {line.newProduct && <div className="grid grid-cols-[minmax(0,1fr)_100px] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_100px_auto]">
              <FormLabel label={`Selling price ${index + 1} (PHP)`} required className="min-w-0 text-xs"><input {...numericInputProps(true)} type="text" required pattern="[0-9]{1,10}([.][0-9]{1,2})?" maxLength={13} className={control} value={line.newProduct.sellingPrice} aria-invalid={!!productValidation && !productValidation.success && productValidation.error.issues.some(issue => issue.path[0] === "sellingPrice")} onChange={event => updateNewProduct(index, { sellingPrice: event.target.value })} placeholder="Enter selling price" /></FormLabel>
              <FormLabel label={`Markup ${index + 1} (%)`} className="min-w-0 text-xs"><input {...numericInputProps()} type="number" min={0} max={100} step={1} className={control} value={markup} onChange={event => update(index, { markupPercent: event.target.value })} /></FormLabel>
              <button type="button" aria-label={`Apply suggested price ${index + 1}`} title="Apply unit cost plus markup, rounded to the nearest cent" className={secondaryButton + " col-span-2 h-10 px-3! text-xs! sm:col-span-1"} disabled={suggestedPrice === null} onClick={() => { if (suggestedPrice !== null) updateNewProduct(index, { sellingPrice: suggestedPrice }); }}>Apply {suggestedPrice === null ? "price" : formatCurrency(Number(suggestedPrice))}</button>
            </div>}
            {line.matchStatus === "ambiguous" && <p className="text-xs text-amber-700 dark:text-amber-400">Several active products match these details. Select the correct product.</p>}
            {line.newProduct ? <details aria-label={`New product details ${index + 1}`} className="group space-y-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 [&::-webkit-details-marker]:hidden"><span className="group-open:hidden">Set up new product</span><span className="hidden group-open:inline">Hide new product details</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
              <div className="grid items-start gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 dark:bg-neutral-800/40 [&>label]:min-w-0 [&_input]:min-w-0">
                {nameField}{codeField}
                <FormLabel label={`Size ${index + 1}`} className="text-xs sm:col-span-2"><input maxLength={50} className={control} value={line.newProduct.size ?? ""} onChange={event => updateNewProduct(index, { size: event.target.value })} placeholder="e.g. Medium" /></FormLabel>
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400">SKU is assigned when saved. The new product and received purchase save together, and the invoice quantity is immediately added to stock.</p>
            </details> : <details className="space-y-3 rounded-lg border border-slate-100 p-3 dark:border-neutral-800"><summary className="cursor-pointer text-xs font-medium">Invoice details and corrections</summary>{line.matchStatus === "suggested" && <div className="space-y-2 text-xs text-blue-700 dark:text-blue-300"><p>Suggested product: {matchedProduct?.name}. Choose Existing catalog product from Product match to confirm.</p><p>Invoice code: {line.supplierProductCode || "Not read"}. Catalog code: {matchedProduct?.supplierProductCode || "Not set"}.</p></div>}<div className="grid gap-3 sm:grid-cols-2">{nameField}{codeField}</div>{matchedProduct && <p className="text-xs text-slate-500 dark:text-neutral-400">Stored unit cost: {formatCurrency(matchedProduct.unitCost)}. The reviewed invoice unit cost above will be saved for this purchase. Receiving updates the moving average; the selling price stays unchanged.</p>}</details>}
            {!validQuantity && <p id={quantityErrorId} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />{quantityMessage}</p>}
            {productValidation && !productValidation.success && <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">{validationMessages(productValidation.error.issues).map(message => <li key={message}>{message}</li>)}</ul>}
            {catalogDuplicates[index] && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{catalogBarcodeDuplicates[index] ? "A product with this barcode already exists." : "This product name already exists. Matching names require different, non-empty sizes."} Select the catalog product; check archived products too.</p>}
            {!validation.success && validation.error.issues.filter(issue => issue.path[0] === "items" && issue.path[1] === index && /^Repeated (product name|barcode)/.test(issue.message)).map(issue => <p key={issue.message} role="alert" className="text-xs text-red-600 dark:text-red-400">{issue.message}</p>)}
            {reviewWarning && <p className="text-xs text-amber-700 dark:text-amber-400">{reviewWarning}</p>}
          </div>;
          })}
          {duplicate && <p className="text-sm text-red-600">Each product can appear only once. Combine quantities for repeated products.</p>}
          {lines.length > 100 && <p className="text-sm text-red-600">An order supports up to 100 products. Split this invoice into separate orders.</p>}
          <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30"><p className="font-semibold">Estimated purchase total: {formatCurrency(total)}</p><p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">The server validates the reviewed unit costs and recalculates all line totals. Saving records a received purchase, adds quantities to current stock, and posts the matching inventory and finance records together.</p>{newProductCount > 0 && <p className="mt-2 text-sm">{newProductCount} new product{newProductCount === 1 ? "" : "s"} will be added to Products when saved.</p>}</div>
          {reviewed && errors.length > 0 && <div role="alert" className="text-sm text-red-600 dark:text-red-400"><ul className="list-inside list-disc space-y-1">{errors.map(message => <li key={message}>{message}</li>)}</ul></div>}
          <FormLabel label="I checked every invoice line, product, quantity, cost, selling price, supplier and date. These goods were received and these quantities have not already been recorded in stock." required className="flex! items-start gap-2 font-normal"><input type="checkbox" required checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="order-first mt-1 accent-violet-600" /></FormLabel>
          {unconfirmed && <p className="text-sm text-amber-700 dark:text-amber-400">Confirm suggested matches or choose a product for every unresolved line.</p>}
          <div className="flex justify-end"><button type="submit" className={primaryButton} disabled={isGuest || !reviewed || !validation.success || catalogDuplicates.some(Boolean) || unconfirmed}>{mutation.saving ? "Saving..." : "Save received purchase"}</button></div>
        </fieldset>
      </form>
    </Modal>
  </>;
}
