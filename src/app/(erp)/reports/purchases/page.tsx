import ReportView from "@/components/features/ReportView";
import { listTransactions } from "@/services/transaction.service";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function PurchaseReportsPage() { await requirePageAccess("reports"); const rows = await listTransactions("purchasing"); return <ReportView kind="purchases" rows={rows.filter(row => row.status === "RECEIVED")} />; }
