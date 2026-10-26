import "server-only";
import snapshot from "./guest-snapshot.json";
import { sumMoney } from "@/lib/money";
import type { ContactRow, LedgerRow, TransactionRow } from "@/types/features";
import type { ChartTransaction, InventoryMovementRow, ProductRow } from "@/types/views";

type GuestRecords = {
  products: ProductRow[]; customers: ContactRow[]; suppliers: ContactRow[];
  sales: TransactionRow[]; purchases: TransactionRow[];
  movements: InventoryMovementRow[]; ledger: LedgerRow[];
};

const records: GuestRecords = snapshot.data;
if (snapshot.version !== 2 || snapshot.source !== "erp_lite") throw new Error("The bundled guest snapshot is invalid.");

export const guestSnapshotInfo = {
  source: snapshot.source, capturedAt: snapshot.capturedAt, capabilities: snapshot.capabilities,
};

export function createGuestData() {
  // Every call returns fresh records; guest previews cannot change the bundled snapshot.
  const data = JSON.parse(JSON.stringify(records)) as GuestRecords;
  const completed = data.sales.filter(row => row.status === "COMPLETED");
  const received = data.purchases.filter(row => row.status === "RECEIVED");
  const transactions: ChartTransaction[] = [
    ...completed.map(row => ({ timestamp: row.timestamp, amount: Number(row.total), type: "sales" as const })),
    ...received.map(row => ({ timestamp: row.timestamp, amount: Number(row.total), type: "purchase" as const })),
  ];
  return { ...data, dashboard: {
    totalItems: data.products.length,
    lowStockItems: data.products.filter(product => product.status === "ACTIVE" && product.stockQty <= 10).length,
    totalSales: Number(sumMoney(completed.map(row => row.total))),
    totalPurchases: Number(sumMoney(received.map(row => row.total))),
    transactions,
    recentOrders: data.sales.slice(0, 4).map(row => ({ id: row.id, customer: row.party, totalAmount: Number(row.total), status: row.status })),
  } };
}
