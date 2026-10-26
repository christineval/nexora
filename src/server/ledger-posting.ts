import "server-only";
import { Prisma } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

export async function postLedgerEntries(tx: Prisma.TransactionClient, entries: Prisma.ledger_entriesCreateManyInput[]) {
  let debits = new Prisma.Decimal(0);
  let credits = new Prisma.Decimal(0);
  for (const entry of entries) {
    const amount = new Prisma.Decimal(entry.amount.toString());
    if (!amount.isFinite() || amount.lte(0) || amount.gt("9999999999.99") || !amount.equals(amount.toDecimalPlaces(2))) throw new BusinessError("The ledger amount is invalid or exceeds PHP 9,999,999,999.99. Split this transaction or review its costs.");
    if (entry.entry_type === "DEBIT") debits = debits.add(amount);
    else if (entry.entry_type === "CREDIT") credits = credits.add(amount);
    else throw new BusinessError("Invalid ledger entry type.");
  }
  if (!entries.length || !debits.equals(credits)) throw new BusinessError("Ledger debits and credits must balance.");
  await tx.ledger_entries.createMany({ data: entries });
}
