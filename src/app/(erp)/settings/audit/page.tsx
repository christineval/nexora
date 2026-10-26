import Link from "next/link";
import { requirePageAccess } from "@/lib/auth";
import { listAuditLogs } from "@/services/audit.service";
import { auditFilterSchema } from "@/validations/audit.schema";
import FeatureHeading from "@/components/ui/FeatureHeading";
import { control, primaryButton, secondaryButton } from "@/components/ui/feature-styles";
import { formatDateTime } from "@/lib/utils";
import { philippineDate } from "@/lib/feature-list";

export const dynamic = "force-dynamic";
type Search = Record<string, string | string[] | undefined>;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePageAccess("audit");
  const today = philippineDate(new Date().toISOString());
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== "" && value !== undefined));
  const parsed = auditFilterSchema.safeParse(input);
  const filters = parsed.success ? parsed.data : {};
  const data = parsed.success ? await listAuditLogs(user, filters) : null;
  function pageLink(page: number) {
    const params = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
    params.set("page", String(page));
    return "/settings/audit?" + params.toString();
  }
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] as string : "";
  return <>
    <FeatureHeading title="Audit Log" description="Admin and employee authentication and business activity. Times are shown in Asia/Manila." />
    <form className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-sm">User ID<input className={control} name="actorId" inputMode="numeric" defaultValue={value("actorId")} placeholder="All users" /></label>
      <label className="grid gap-1 text-sm">Action<input className={control} name="action" defaultValue={value("action")} placeholder="e.g. PRODUCT_CREATED" /></label>
      <label className="grid gap-1 text-sm">Record type<select className={control} name="entity" defaultValue={value("entity")}><option value="">All types</option>{["AUTH", "USER", "PRODUCT", "CUSTOMER", "SUPPLIER", "ORDER", "PURCHASE_ORDER", "INVENTORY_MOVEMENT", "LEDGER", "ACCESS"].map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Outcome<select className={control} name="outcome" defaultValue={value("outcome")}><option value="">All outcomes</option><option>SUCCESS</option><option>FAILURE</option><option>DENIED</option></select></label>
      <label className="grid gap-1 text-sm">From<input className={control} type="date" max={today} name="from" defaultValue={value("from")} /></label>
      <label className="grid gap-1 text-sm">To<input className={control} type="date" max={today} name="to" defaultValue={value("to")} /></label>
      <div className="flex items-end gap-2"><button className={primaryButton} type="submit">Filter</button><Link className={secondaryButton} href="/settings/audit">Reset</Link></div>
    </form>
    {!parsed.success && <p role="alert" className="mb-4 text-sm text-red-600">{parsed.error.issues[0]?.message}</p>}
    {data && <>
      <p className="mb-3 text-sm text-slate-500">{data.total} events · Read-only history</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-neutral-700">
        <table className="w-full text-left text-sm"><caption className="sr-only">Audit events, newest first</caption>
          <thead className="bg-slate-50 dark:bg-neutral-900"><tr>{["Time", "User", "Action", "Record", "Outcome", "Details"].map(title => <th key={title} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{title}</th>)}</tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.id} className="border-t border-slate-200 align-top dark:border-neutral-700">
            <td className="whitespace-nowrap px-4 py-3"><time dateTime={row.created_at}>{formatDateTime(row.created_at)}</time></td>
            <td className="px-4 py-3"><p>{row.actor_name}</p><p className="whitespace-nowrap text-xs text-slate-500">{row.actor_role ?? "Unauthenticated"}{row.actor_id ? ` · #${row.actor_id}` : ""}</p></td>
            <td className="px-4 py-3">{row.action.replaceAll("_", " ")}</td>
            <td className="px-4 py-3">{row.entity_type.replaceAll("_", " ")}{row.entity_id ? ` #${row.entity_id}` : ""}</td>
            <td className="px-4 py-3">{row.outcome}</td>
            <td className="min-w-56 px-4 py-3">{row.before !== null || row.after !== null ? <details><summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-violet-500">View changes<span className="sr-only"> for event #{row.id}</span></summary><div className="mt-2 grid gap-3"><div><p className="font-medium">Before</p><pre className="max-h-72 max-w-md overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-neutral-900">{JSON.stringify(row.before, null, 2)}</pre></div><div><p className="font-medium">After</p><pre className="max-h-72 max-w-md overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-neutral-900">{JSON.stringify(row.after, null, 2)}</pre></div></div></details> : "—"}</td>
          </tr>)}{data.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No audit events match these filters.</td></tr>}</tbody>
        </table>
      </div>
      <nav aria-label="Audit log pagination" className="mt-4 flex flex-wrap items-center gap-3">{data.page > 1 && <Link className={secondaryButton} href={pageLink(data.page - 1)}>Previous</Link>}<span className="text-sm">Page {data.page} of {data.pages}</span>{data.page < data.pages && <Link className={secondaryButton} href={pageLink(data.page + 1)}>Next</Link>}</nav>
    </>}
    <p className="mt-5 text-xs text-slate-500">History starts when audit logging is enabled. Closing the browser is not a logout event. Contact details and credentials are excluded.</p>
  </>;
}
