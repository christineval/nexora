export default function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-gray-100 dark:bg-[#303030] px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">{children}</span>;
}
