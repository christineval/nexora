export default function Loading() {
  return <div role="status" aria-label="Loading feature page" className="animate-pulse motion-reduce:animate-none"><div className="mb-3 h-7 w-48 rounded bg-slate-200 dark:bg-neutral-800" /><div className="mb-8 h-4 w-72 max-w-full rounded bg-slate-200 dark:bg-neutral-800" /><div className="mb-4 h-10 rounded bg-slate-200 dark:bg-neutral-800" /><div className="h-[432px] rounded-xl border border-slate-200 bg-white dark:border-neutral-700 dark:bg-[#191919]" /><span className="sr-only">Loading records...</span></div>;
}
