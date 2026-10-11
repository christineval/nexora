"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export default function Modal({ open, title, children, onClose, wide = false, busy = false }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (open && !dialog?.open) dialog?.showModal(); else if (!open && dialog?.open) dialog.close(); }, [open]);
  return <dialog ref={ref} onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose} aria-label={title} className={"m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 text-gray-900 backdrop:bg-black/40 dark:border-[#303030] dark:bg-[#191919] dark:text-[#f5f5f5] dark:backdrop:bg-black/70 " + (wide ? "max-w-3xl" : "max-w-lg")}>
    <div className="flex items-start justify-between gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <button type="button" disabled={busy} onClick={onClose} aria-label="Close modal" className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-neutral-400 dark:hover:bg-neutral-800"><X aria-hidden="true" className="size-5" /></button>
    </div>
    {children}
  </dialog>;
}
