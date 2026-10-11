"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";

export default function MobileNavigation({ role }: { role?: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();

    if (!open) return;
    const wasLocked = document.body.classList.contains("overflow-hidden");
    document.body.classList.add("overflow-hidden");
    return () => {
      if (!wasLocked) document.body.classList.remove("overflow-hidden");
    };
  }, [open]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => setOpen(false);
    const onResize = () => { if (desktop.matches) close(); };
    desktop.addEventListener("change", onResize);
    window.addEventListener("popstate", close);
    return () => {
      desktop.removeEventListener("change", onResize);
      window.removeEventListener("popstate", close);
    };
  }, []);

  return <>
    <button
      type="button"
      aria-label={open ? "Close navigation" : "Open navigation"}
      aria-expanded={open}
      aria-controls="mobile-navigation"
      aria-haspopup="dialog"
      onClick={() => setOpen(!open)}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 lg:hidden"
    >
      <Menu aria-hidden="true" className="size-5" />
    </button>
    <dialog
      ref={dialog}
      id="mobile-navigation"
      aria-label="Navigation menu"
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
      className="m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 dark:bg-[#101010] dark:text-neutral-100"
    >
      <div className="relative h-full">
        <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute top-4 right-3 z-10 flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-neutral-300 dark:hover:bg-neutral-800"><X aria-hidden="true" className="size-5" /></button>
        <Sidebar mobile role={role} onNavigate={() => setOpen(false)} />
      </div>
    </dialog>
  </>;
}
