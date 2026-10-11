import "server-only";
import { prisma } from "@/lib/prisma";
import { sumMoney } from "@/lib/money";
import type { LedgerRow } from "@/types/features";
export async function listLedgerEntries(): Promise<LedgerRow[]> {
  const rows = await prisma.ledger_entries.findMany({ include: { users: { select: { name: true } } }, orderBy: [{ transaction_date: "desc" }, { id: "desc" }] });
  return rows.map(row => ({ id: row.id.toString(), timestamp: row.transaction_date.toISOString(), account: row.account_name, type: row.entry_type, amount: row.amount.toFixed(2), reference: row.reference_id ? (row.reference_type ?? "Reference") + " #" + row.reference_id.toString() : row.reference_type ?? "—", description: row.description, createdBy: row.users.name }));
}
export async function getFinanceSummary() {
  const rows = await listLedgerEntries();
  return { debits: sumMoney(rows.filter(row => row.type === "DEBIT").map(row => row.amount)), credits: sumMoney(rows.filter(row => row.type === "CREDIT").map(row => row.amount)) };
}
