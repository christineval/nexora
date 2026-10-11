export default function FeatureHeading({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">{description}</p></div>{children}</header>;
}
