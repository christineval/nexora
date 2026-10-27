import { formatDateTime } from "./utils";

const labels: Record<string, string> = {
  id: "Record ID", name: "Name", role: "Role", sku: "SKU", supplier_product_code: "Supplier product code",
  size: "Size", status: "Status", stock_qty: "Stock quantity", unit_cost: "Unit cost", selling_price: "Selling price",
  inventory_value: "Inventory value", cost_amount: "Inventory cost", customer_id: "Customer", supplier_id: "Supplier",
  order_date: "Order date", purchase_date: "Purchase date", payment_date: "Payment date", subtotal: "Subtotal",
  tax: "Tax", total_amount: "Total amount", order_items: "Sales items", purchase_items: "Purchase items",
  product_id: "Product", order_id: "Sales order", purchase_order_id: "Purchase order", quantity: "Quantity",
  unit_price: "Unit price", line_total: "Line total", type: "Type", reference_type: "Reference type",
  reference_id: "Reference ID", account_name: "Account", entry_type: "Entry type", amount: "Amount",
  module: "Module", operation: "Operation", reason: "Reason", changed_fields: "Updated fields",
  session_count: "Sessions ended", import_key: "Import reference", import_hash: "Import fingerprint", balance: "Remaining balance",
};
const money = new Set(["unit_cost", "selling_price", "inventory_value", "cost_amount", "subtotal", "tax", "total_amount", "unit_price", "line_total", "amount", "balance"]);
const dates = new Set(["order_date", "purchase_date", "payment_date"]);
const names: Record<string, string> = { ADMIN: "Administrator", SALES: "Sales", INVENTORY: "Inventory", FINANCE: "Finance", GUEST: "Guest", ADJUSTMENT_IN: "Stock added", ADJUSTMENT_OUT: "Stock removed" };
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function auditFieldLabel(key: string): string {
  return Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : key.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatMoney(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole);
  const formatted = currency.formatToParts(amount).map(part => part.type === "fraction" ? fraction.padEnd(2, "0") : part.value).join("");
  return value.startsWith("-") && amount === 0n ? "-" + formatted : formatted;
}

export function auditValueText(key: string, value: unknown): string {
  if (value === undefined) return "Not recorded";
  if (value === null || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(item => key === "changed_fields" && typeof item === "string" ? auditFieldLabel(item) : auditValueText(key, item)).join(", ") : "None";
  const text = String(value);
  if (money.has(key) && /^-?\d+(\.\d{1,2})?$/.test(text)) return formatMoney(text);
  if ((dates.has(key) || key.endsWith("_at")) && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) && Number.isFinite(new Date(text).getTime())) {
    return dates.has(key) ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(text)) : formatDateTime(text);
  }
  if ((key === "id" || key.endsWith("_id")) && /^\d+$/.test(text)) return "#" + text;
  if (Object.prototype.hasOwnProperty.call(names, text)) return names[text];
  if (/^[A-Z][A-Z_]+$/.test(text) && key !== "sku" && key !== "supplier_product_code") return text.toLowerCase().replaceAll("_", " ").replace(/^\w/, letter => letter.toUpperCase());
  return text;
}

type Field = { label: string; key: string; value: unknown };
export type AuditChange = { path: string; label: string; before: string; after: string; kind: "added" | "removed" | "updated" };

function fields(value: unknown): Map<string, Field> {
  const result = new Map<string, Field>();
  function visit(current: unknown, path: string, label: string, key: string) {
    if (Array.isArray(current) && current.length && key !== "changed_fields") {
      const seen = new Set<string>();
      current.forEach((item: unknown, index) => {
        const record = item !== null && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null;
        const product = record?.product_id;
        const recordId = record?.id;
        const identity = typeof product === "string" || typeof product === "number" ? "product:" + product : typeof recordId === "string" || typeof recordId === "number" ? "record:" + recordId : "item:" + index;
        const unique = seen.has(identity) ? identity + ":" + index : identity;
        seen.add(identity);
        const itemLabel = identity.startsWith("product:") ? "Product #" + product : "Item " + (index + 1);
        visit(item, path + "/" + unique, [label, itemLabel].filter(Boolean).join(" · "), key);
      });
    } else if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      const entries = Object.entries(current);
      if (!entries.length) result.set(path, { label: label || "Details", key, value: "None" });
      for (const [child, entry] of entries) visit(entry, path + "/" + child, [label, auditFieldLabel(child)].filter(Boolean).join(" · "), child);
    } else result.set(path, { label: label || "Value", key, value: current });
  }
  if (value !== null && value !== undefined) visit(value, "", "", "");
  return result;
}

export function getAuditChanges(before: unknown, after: unknown): AuditChange[] {
  const previous = fields(before), next = fields(after);
  return [...new Set([...previous.keys(), ...next.keys()])].flatMap(path => {
    const old = previous.get(path), current = next.get(path);
    if (old && current && JSON.stringify(old.value) === JSON.stringify(current.value)) return [];
    const field = current ?? old;
    if (!field) return [];
    return [{ path, label: field.label, before: auditValueText(field.key, old?.value), after: auditValueText(field.key, current?.value), kind: !old ? "added" as const : !current ? "removed" as const : "updated" as const }];
  });
}
