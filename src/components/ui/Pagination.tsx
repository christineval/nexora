"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

const arrowButton = "flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-violet-50 hover:text-violet-600 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-violet-950/40 dark:hover:text-violet-300";

export default function Pagination({ page, pageCount, start, end, total, label, navigationLabel = label + " pagination", onPageChange }: {
  page: number; pageCount: number; start: number; end: number; total: number;
  label: string; navigationLabel?: string; onPageChange: (page: number) => void;
}) {
  const firstPage = Math.max(1, Math.min(page - 1, pageCount - 2));
  const pageNumbers = Array.from({ length: Math.min(3, pageCount) }, (_, index) => firstPage + index);

  return <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 dark:border-[#303030]">
    <p role="status" aria-live="polite" className="text-xs text-slate-500 dark:text-neutral-400">Showing {start} to {end} of {total} {label.toLowerCase()}</p>
    <nav aria-label={navigationLabel} className="flex gap-1.5">
      <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)} className={arrowButton}><ChevronLeft aria-hidden="true" className="size-4" /></button>
      {pageNumbers.map(number => <button key={number} type="button" aria-label={"Page " + number} aria-current={page === number ? "page" : undefined} onClick={() => onPageChange(number)} className={"size-8 rounded-md border text-xs font-medium focus-visible:outline-2 focus-visible:outline-violet-500 " + (page === number ? "border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-200 dark:shadow-none" : "border-slate-200 hover:bg-slate-50 dark:border-neutral-700 dark:hover:bg-neutral-800")}>{number}</button>)}
      <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} className={arrowButton}><ChevronRight aria-hidden="true" className="size-4" /></button>
    </nav>
  </footer>;
}
