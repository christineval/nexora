export interface ProductRow {
  productId: string; sku: string; name: string; size: string | null;
  stockQty: number; unitCost: number; sellingPrice: number; status: string;
}
export interface InventoryMovementRow {
  id: string;
  timestamp: string;
  productId: string;
  productName: string;
  productSku: string;
  type: string;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string;
}
export interface SalesRow {
  id: string; salesId: string; name: string; customer: string; size: string | null;
  qty: number; timestamp: string; sellingPrice: number; totalAmount: number; status: string;
}
export interface PurchaseRow {
  id: string; invoiceID: string; supplier: string; qty: number;
  totalPrice: number; timestamp: string; status: string;
}
export interface ChartTransaction { timestamp: string; amount: number; type: "sales" | "purchase" }
export interface RecentOrder { id: string; customer: string; totalAmount: number; status: string }
