import { toMinorUnits } from "./money";
import type { ProductRow } from "@/types/views";

export type ImportedPurchaseLine = {
  description: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  warning: string;
};

const amount = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{1,2})?";
const rowPattern = new RegExp(`^(.+?)\\s+(\\d+)\\s+(?:PHP\\s*|₱\\s*)?(${amount})\\s+(?:PHP\\s*|₱\\s*)?(${amount})$`, "i");
const leadingQuantityPattern = new RegExp(`^(\\d+)\\s+(?:x\\s+)?(.+?)\\s+(?:PHP\\s*|₱\\s*)?(${amount})\\s+(?:PHP\\s*|₱\\s*)?(${amount})$`, "i");
const summary = /^(?:sub\s*total|grand\s*total|total\b|tax\b|vat\b|discount\b|change\b|cash\b|amount\s+due|balance\b)/i;

export function normalizeImportName(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function matchImportProduct(description: string, products: ProductRow[]) {
  const name = normalizeImportName(description);
  const matches = products.filter(product => product.status === "ACTIVE" && [product.sku, product.name, [product.name, product.size].filter(Boolean).join(" ")].some(value => normalizeImportName(value) === name));
  return matches.length === 1 ? matches[0].productId : "";
}

export function parsePurchaseText(text: string, products: ProductRow[]): ImportedPurchaseLine[] {
  const result: ImportedPurchaseLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/[\t|]+/g, " ").replace(/\s+/g, " ");
    if (!line || summary.test(line)) continue;
    const trailing = line.match(rowPattern);
    const leading = trailing ? null : line.match(leadingQuantityPattern);
    if (!trailing && !leading) continue;
    const [, description, quantity, price, total] = trailing ?? ["", leading![2], leading![1], leading![3], leading![4]];
    const unitPrice = price.replaceAll(",", "");
    const productId = matchImportProduct(description, products);
    const warnings = [];
    if (!productId) warnings.push("Select the matching product.");
    if (BigInt(quantity) < 1n || BigInt(quantity) > 2147483647n) warnings.push("Check the quantity.");
    if (toMinorUnits(unitPrice) * BigInt(quantity) !== toMinorUnits(total.replaceAll(",", ""))) warnings.push("Quantity × unit price differs from the printed line total.");
    result.push({ description, productId, quantity, unitPrice, warning: warnings.join(" ") });
  }
  return result;
}
