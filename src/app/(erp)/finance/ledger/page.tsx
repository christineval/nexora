import LedgerManager from "@/components/features/LedgerManager";
import { listLedgerEntries } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function GeneralLedgerPage() { const user = await requirePageAccess("finance"); return <LedgerManager rows={await listLedgerEntries(user)} />; }
