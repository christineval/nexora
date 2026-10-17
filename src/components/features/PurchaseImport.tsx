"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import Modal from "@/components/ui/Modal";
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

export default function PurchaseImport({ parties, products }: { parties: ContactRow[]; products: ProductRow[] }) {
  const textId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [lines, setLines] = useState<ImportedPurchaseLine[]>([]);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(philippineDate(new Date().toISOString()));
  const [reviewed, setReviewed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const mutation = useMutation();
  const { notify } = useNotifications();
  useEffect(() => () => controller.current?.abort(), []);

  function update(index: number, patch: Partial<ImportedPurchaseLine>) {
    setLines(current => current.map((line, position) => position === index ? { ...line, ...patch, warning: patch.productId ? line.warning.replace("Select the matching product.", "").trim() : line.warning } : line));
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
  async function recognize() {
    if (!file || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setReading(true); setError(""); setProgress("Loading OCR..."); setReviewed(false);
    try {
      const result = await readReceipt(file, setProgress, abort.signal);
      if (abort.signal.aborted) return;
      setText(result); extract(result);
      if (!result.trim()) setError("No text was found. Try a clearer scan or paste the invoice text below.");
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to read this invoice. Try a clearer image.");
    } finally { controller.current = null; setReading(false); setProgress(""); }
  }
  const active = products.filter(product => product.status === "ACTIVE");
  const duplicate = lines.some((line, index) => line.productId && lines.some((other, position) => position !== index && other.productId === line.productId));
  const input = { partyId, date, items: lines.map(line => ({ productId: line.productId, quantity: Number(line.quantity) })) };
  const validation = transactionSchema.safeParse(input);
  const total = lines.reduce((sum, line) => sum + (products.find(product => product.productId === line.productId)?.unitCost ?? 0) * (Number(line.quantity) || 0), 0);

  return <>
    <button type="button" className={secondaryButton} onClick={() => { mutation.clearError(); setOpen(true); }}><Upload className="size-4" />Import Receipt / Invoice</button>
    <Modal open={open} wide busy={mutation.saving} title="Import purchase receipt or invoice" onClose={() => { controller.current?.abort(); setOpen(false); }}>
      <form className="mt-5 space-y-5" onSubmit={event => {
        event.preventDefault();
        if (reading || !reviewed) return;
        if (!validation.success) { setError(validation.error.issues[0].message); return; }
        setError("");
        void mutation.submit("/api/purchases", "POST", validation.data, () => { setOpen(false); setLines([]); setText(""); setFile(null); setReviewed(false); if (fileInput.current) fileInput.current.value = ""; notify("Imported pending purchase order saved successfully."); });
      }}>
        <p className="text-sm text-slate-500 dark:text-neutral-400">Import a receipt photo or invoice PDF. Review all products and quantities before saving. Invoice prices are shown for reference; purchase totals use stored product costs.</p>
        <fieldset disabled={reading || mutation.saving} className="space-y-5">
          <label className="grid gap-2 text-sm">Receipt or invoice file<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={event => {
            const selected = event.target.files?.[0]; setError(""); setText(""); setLines([]); setReviewed(false);
            if (selected && (!receiptTypes.includes(selected.type) || !selected.size || selected.size > maxReceiptSize)) { setError("Choose a PNG, JPEG, WebP or PDF under 20 MB."); setFile(null); return; }
            setFile(selected ?? null);
          }} className="block w-full rounded-lg border border-slate-200 p-2 text-sm dark:border-neutral-700" /></label>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Up to 20 MB and 10 PDF pages. OCR runs on this device; the document is not uploaded or retained.</p>
          <button type="button" className={secondaryButton} disabled={!file} onClick={() => void recognize()}>Read with OCR</button>
          <div className="grid gap-2 text-sm"><label htmlFor={textId}>Extracted invoice text</label><textarea id={textId} className={control + " h-36 py-2 font-mono"} value={text} maxLength={100000} onChange={event => { setText(event.target.value); setReviewed(false); }} placeholder="OCR text appears here. You can also paste invoice text." /></div>
          <button type="button" className={secondaryButton} disabled={!text.trim()} onClick={() => { extract(text); setError(""); }}>Extract product lines</button>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Automatic extraction recognizes lines with product name, quantity, unit price and line total. Other layouts need manual correction. Compare the extracted text against the entire invoice, including any skipped lines, discounts and taxes.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">Supplier *<select className={control} required value={partyId} onChange={event => { setPartyId(event.target.value); setReviewed(false); }}><option value="">Select supplier</option>{parties.filter(party => party.status === "ACTIVE").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm">Purchase date *<input type="date" required className={control} value={date} onChange={event => { setDate(event.target.value); setReviewed(false); }} /></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Review products ({lines.length})</h3><button type="button" className={secondaryButton} disabled={lines.length >= 100} onClick={() => { setLines(current => [...current, { description: "", productId: "", quantity: "1", unitPrice: "", warning: "Added manually. Check against the invoice." }]); setReviewed(false); }}><Plus className="size-4" />Add product</button></div>
          {!lines.length && <p className="text-sm text-slate-500 dark:text-neutral-400">No products extracted yet. Read a file, paste text or add products manually.</p>}
          {lines.map((line, index) => <div key={index} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-neutral-700">
            <div className="flex items-start justify-between gap-2"><p className="break-words text-sm font-medium">{line.description || "Product line " + (index + 1)}</p><button type="button" className={iconButton} aria-label={"Remove imported product " + (index + 1)} onClick={() => { setLines(current => current.filter((_, position) => position !== index)); setReviewed(false); }}><Trash2 className="size-4" /></button></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5 text-xs">Matched product {index + 1} *<select required className={control} value={line.productId} onChange={event => update(index, { productId: event.target.value })}><option value="">Select product</option>{active.map(product => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></label>
              <label className="grid gap-1.5 text-xs">Quantity {index + 1} *<input {...numericInputProps()} type="number" required min={1} max={2147483647} step={1} className={control} value={line.quantity} onChange={event => update(index, { quantity: event.target.value })} /></label>
              <label className="grid gap-1.5 text-xs">Invoice unit price {index + 1} (reference)<input {...numericInputProps(true)} type="number" min={0} step="0.01" className={control} value={line.unitPrice} onChange={event => update(index, { unitPrice: event.target.value })} /></label>
            </div>
            {line.warning && <p className="text-xs text-amber-700 dark:text-amber-400">{line.warning}</p>}
            {line.productId && <p className="text-xs text-slate-500 dark:text-neutral-400">Stored unit cost: {formatCurrency(products.find(product => product.productId === line.productId)?.unitCost ?? 0)}</p>}
          </div>)}
          {duplicate && <p className="text-sm text-red-600">Each product can appear only once. Combine quantities for repeated products.</p>}
          {lines.length > 100 && <p className="text-sm text-red-600">An order supports up to 100 products. Split this invoice into separate orders.</p>}
          <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30"><p className="font-semibold">Estimated purchase total: {formatCurrency(total)}</p><p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">The server recalculates the total using stored product costs. Saving creates a pending purchase; stock changes only after receiving it.</p></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-1 accent-violet-600" />I checked every invoice line, matched the products, and verified quantities, supplier and date.</label>
          <div className="flex justify-end"><button type="submit" className={primaryButton} disabled={!reviewed || !validation.success}>{mutation.saving ? "Saving..." : "Create pending purchase"}</button></div>
        </fieldset>
        {reading && <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><span>{progress}</span><button type="button" className={secondaryButton} onClick={() => controller.current?.abort()}>Cancel OCR</button></div>}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Modal>
  </>;
}
