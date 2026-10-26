export type ContactRow = { id: string; name: string; email: string | null; phone: string | null; address: string | null; status: string; contactPerson?: string | null };
export type TransactionItem = { id: string; productId: string; name: string; sku: string; quantity: number; unitPrice: string; lineTotal: string };
export type PurchasePaymentRow = { id: string; amount: string; date: string; reference: string | null };
export type TransactionRow = { id: string; party: string; partyId: string; timestamp: string; status: string; total: string; items: TransactionItem[]; createdBy: string; payments?: PurchasePaymentRow[] };
export type LedgerRow = { id: string; timestamp: string; account: string; type: string; amount: string; reference: string; description: string | null; createdBy: string };
export type UserRow = { id: string; name: string; email: string; role: string; timestamp: string };
