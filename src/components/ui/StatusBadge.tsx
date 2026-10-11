const colors: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  RECEIVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ORDERED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  INACTIVE: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  DEBIT: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  CREDIT: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};
export default function StatusBadge({ value }: { value: string }) { return <span className={"whitespace-nowrap rounded px-2 py-1 text-[10px] font-semibold " + (colors[value] ?? "bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300")}>{value}</span>; }
