"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import ProductForm from "@/components/inventory/ProductForm";
import Modal from "@/components/ui/Modal";

export default function AddProductModal({ nextSku }: { nextSku: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-violet-200 hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:shadow-none"><Plus aria-hidden="true" className="size-4" />Add Product</button>
    <Modal key={open ? "open" : "closed"} open={open} busy={busy} title="Add product" onClose={() => setOpen(false)}>
      <ProductForm onSavingChange={setBusy} nextSku={nextSku} onSuccess={() => setOpen(false)} />
    </Modal>
  </>;
}
