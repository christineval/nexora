import "server-only";
import { philippineDate } from "@/lib/feature-list";
import { fromMinorUnits, sumMoney, toMinorUnits } from "@/lib/money";
import { stockDelta } from "@/lib/stock";
import type { ContactRow, LedgerRow, TransactionRow, UserRow } from "@/types/features";
import type { ChartTransaction, InventoryMovementRow, ProductRow } from "@/types/views";

export function createGuestData(now = new Date()) {
  const today = new Date(philippineDate(now.toISOString()) + "T04:00:00Z");
  const timestamp = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86400000).toISOString();
  const users: UserRow[] = ["ADMIN", "SALES", "INVENTORY", "FINANCE"].map((role, index) => ({
    id: String(950001 + index), name: `Demo ${role.charAt(0) + role.slice(1).toLowerCase()} User`,
    email: `${role.toLowerCase()}@nexora-demo.example`, role, timestamp: timestamp(60),
  }));
  const customers: ContactRow[] = Array.from({ length: 12 }, (_, index) => ({
    id: String(930001 + index), name: `Demo Customer ${index + 1}`, email: `customer${index + 1}@nexora-demo.example`,
    phone: null, address: `Sample customer address ${index + 1}`, status: index === 11 ? "INACTIVE" : "ACTIVE",
  }));
  const suppliers: ContactRow[] = Array.from({ length: 10 }, (_, index) => ({
    id: String(940001 + index), name: `Demo Supplier ${index + 1}`, email: `supplier${index + 1}@nexora-demo.example`,
    phone: null, address: `Sample supplier address ${index + 1}`, status: index === 9 ? "INACTIVE" : "ACTIVE", contactPerson: `Demo Contact ${index + 1}`,
  }));
  const productNames = ["Notebook", "Desk Lamp", "Wireless Mouse", "Keyboard", "Water Bottle", "Office Chair", "USB Cable", "Backpack", "Headphones", "Monitor Stand", "Desk Organizer", "Travel Mug"];
  const products: ProductRow[] = productNames.map((name, index) => ({
    productId: String(920001 + index), sku: `DEMO-${String(index + 1).padStart(4, "0")}`, name: `Demo ${name}`,
    size: null, stockQty: 0, unitCost: 100 + index * 50, sellingPrice: 150 + index * 75, status: index === 11 ? "INACTIVE" : "ACTIVE",
  }));
  const movements: InventoryMovementRow[] = products.map((product, index) => ({
    id: String(960001 + index), timestamp: timestamp(45), productId: product.productId, productName: product.name,
    productSku: product.sku, type: "ADJUSTMENT_IN", quantity: index % 3 === 0 ? 5 : 20 + index,
    referenceType: null, referenceId: null, createdBy: users[2].name,
  }));
  const ledger: LedgerRow[] = [];
  function transactions(kind: "sales" | "purchasing"): TransactionRow[] {
    const sales = kind === "sales";
    const parties = sales ? customers : suppliers;
    const statuses = sales ? ["COMPLETED", "CONFIRMED", "PENDING", "CANCELLED"] : ["RECEIVED", "ORDERED", "PENDING", "CANCELLED"];
    return Array.from({ length: 16 }, (_, index) => {
      const id = String((sales ? 900001 : 910001) + index);
      const party = parties[index % (parties.length - 1)];
      const items = [0, 1].map(offset => {
        const product = products[(index + offset) % (products.length - 1)];
        const quantity = 1 + (index + offset) % 2;
        const unitPrice = (sales ? product.sellingPrice : product.unitCost).toFixed(2);
        return { id: `${sales ? 980001 : 990001 + 100}${index}${offset}`, productId: product.productId,
          name: product.name, sku: product.sku, quantity, unitPrice, lineTotal: fromMinorUnits(toMinorUnits(unitPrice) * BigInt(quantity)) };
      });
      const total = sumMoney(items.map(item => item.lineTotal));
      const status = statuses[index % statuses.length];
      const eventDate = timestamp(16 - index);
      if (index % statuses.length === 0) {
        const referenceType = sales ? "ORDER" : "PURCHASE_ORDER";
        for (const item of items) movements.push({
          id: String(960001 + movements.length), timestamp: eventDate, productId: item.productId, productName: item.name,
          productSku: item.sku, type: sales ? "SALE" : "PURCHASE", quantity: item.quantity,
          referenceType, referenceId: id, createdBy: users[sales ? 1 : 2].name,
        });
        for (const [position, account] of (sales ? ["Cash", "Sales Revenue"] : ["Inventory", "Accounts Payable"]).entries()) ledger.push({
          id: String(970001 + ledger.length), timestamp: eventDate, account, type: position === 0 ? "DEBIT" : "CREDIT",
          amount: total, reference: `${referenceType} #${id}`, description: sales ? "Demo completed cash sale" : "Demo inventory received on supplier credit", createdBy: users[sales ? 1 : 2].name,
        });
      }
      return { id, party: party.name, partyId: party.id, timestamp: eventDate, status, total, createdBy: users[sales ? 1 : 2].name, items };
    }).reverse();
  }
  const sales = transactions("sales");
  const purchases = transactions("purchasing");
  for (const product of products) product.stockQty = movements.filter(movement => movement.productId === product.productId).reduce((sum, movement) => sum + stockDelta(movement.type, movement.quantity), 0);
  const completed = sales.filter(row => row.status === "COMPLETED");
  const received = purchases.filter(row => row.status === "RECEIVED");
  const chart: ChartTransaction[] = [
    ...completed.map(row => ({ timestamp: row.timestamp, amount: Number(row.total), type: "sales" as const })),
    ...received.map(row => ({ timestamp: row.timestamp, amount: Number(row.total), type: "purchase" as const })),
  ];
  return { products, customers, suppliers, sales, purchases, users,
    movements: movements.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || Number(b.id) - Number(a.id)),
    ledger: ledger.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || Number(b.id) - Number(a.id)),
    dashboard: {
      totalItems: products.length, lowStockItems: products.filter(product => product.status === "ACTIVE" && product.stockQty <= 10).length,
      totalSales: Number(sumMoney(completed.map(row => row.total))), totalPurchases: Number(sumMoney(received.map(row => row.total))),
      transactions: chart, recentOrders: sales.slice(0, 4).map(row => ({ id: row.id, customer: row.party, totalAmount: Number(row.total), status: row.status })),
    },
  };
}
