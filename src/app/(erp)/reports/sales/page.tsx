import ReportView from "@/components/features/ReportView";
import { listTransactions } from "@/services/transaction.service";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function SalesReportsPage() { await requirePageAccess("reports"); const rows = await listTransactions("sales"); return <ReportView kind="sales" rows={rows.filter(row => row.status === "COMPLETED")} />; }
