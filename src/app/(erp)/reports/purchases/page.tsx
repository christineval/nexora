import ReportView from "@/components/features/ReportView";
import { listTransactions } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function PurchaseReportsPage() { const user = await requirePageAccess("reports"); const rows = await listTransactions(user, "purchasing"); return <ReportView kind="purchases" rows={rows.filter(row => row.status === "RECEIVED")} />; }
