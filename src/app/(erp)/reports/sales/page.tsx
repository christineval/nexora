import ReportView from "@/components/features/ReportView";
import { listTransactions } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function SalesReportsPage() { const user = await requirePageAccess("reports"); const rows = await listTransactions(user, "sales"); return <ReportView kind="sales" rows={rows.filter(row => row.status === "COMPLETED")} />; }
