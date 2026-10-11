"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function HeaderDropdown({ label, trigger, children, buttonClassName = "" }: { label: string; trigger: ReactNode; children: ReactNode; buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div ref={container} className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <button ref={button} type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className={`rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${buttonClassName}`}>{trigger}</button>
    {open && <div id={id} role="region" aria-label={label} className="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-lg dark:border-neutral-700 dark:bg-[#191919] dark:text-[#f5f5f5]">{children}</div>}
  </div>;
}
