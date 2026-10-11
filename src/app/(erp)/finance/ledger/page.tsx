import LedgerManager from "@/components/features/LedgerManager";
import { listLedgerEntries } from "@/services/finance.service";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function GeneralLedgerPage() { await requirePageAccess("finance"); return <LedgerManager rows={await listLedgerEntries()} />; }
