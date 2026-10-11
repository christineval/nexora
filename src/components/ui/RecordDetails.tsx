export default function RecordDetails({ fields }: { fields: [string, React.ReactNode][] }) {
  return <dl className="my-5 grid gap-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500 dark:text-neutral-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value === null || value === undefined || value === "" ? "—" : value}</dd></div>)}</dl>;
}
