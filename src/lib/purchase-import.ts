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
const priceOnlyRow = new RegExp(`^(.+?)\\s+(\\d+)\\s+(?:PHP\\s*|₱\\s*)?(${amount})$`, "i");
const discountedRow = new RegExp(`^(.+?)\\s+(\\d+)\\s+(${amount})\\s+(${amount})\\s+(${amount})$`, "i");
const summary = /^(?:sub[\s-]*total|grand\s*total|total\b|tax\b|vat\b|disc(?:ount)?\.?\b|change\b|cash\b|amount\s+due|balance\b|nothing\s+follows)/i;

// Barcodes and a discount column must not become part of the name or quantity.
const codedRow = /^(.*?)\s+([A-Z0-9]+(?:[-~][A-Z0-9]+)+)\s+(.+)$/i;
const printedMoney = /^(?:PHP\s*|₱\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})$/i;
const units = /^(?:(\d+)\s+)?(?:pcs?|pieces?|reams?|packs?|boxes?|bottles?|sets?)\s+/i;

function parseCodedRow(line: string) {
  const match = line.match(codedRow);
  if (!match) return null;
  const [, prefix, barcode, columns] = match;
  const values = columns.trim().split(/\s+/);
  if (!/^(?:[\dOo]+[.,][\dOo?%¢]+|\?)$/.test(values[0])) return null;
  // Keep damaged numeric cells blank rather than shifting later columns left.
  if (values.length < 3 || values.length > 5) return null;
  const price = values[1].match(printedMoney)?.[1].replaceAll(",", "") ?? "";
  const total = values.slice(2).join(" ").match(printedMoney)?.[1].replaceAll(",", "") ?? "";
  const unit = prefix.match(units);
  return {
    description: unit ? prefix.slice(unit[0].length) : prefix.replace(/^\d+\s+/, ""),
    quantity: unit?.[1] ?? prefix.match(/^(\d+)\s+/)?.[1] ?? "",
    price, total, barcode,
    discount: values[0].match(printedMoney)?.[1].replaceAll(",", "") ?? "",
  };
}

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
  let hasTotal = true;
  let hasDiscount = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/[\t|]+/g, " ").replace(/\s+/g, " ");
    if (!line || summary.test(line.replace(/^[^\p{L}\p{N}]+/u, ""))) continue;
    if (/\b(?:description[s]?|product[s]?|item[s]?)\b/i.test(line) && /\b(?:qty|quantity)\b/i.test(line) && /\bprice\b/i.test(line)) {
      hasTotal = /\btotal\b/i.test(line);
      hasDiscount = /\bdisc(?:ount)?\.?/i.test(line);
      continue;
    }
    const coded = parseCodedRow(line);
    const discounted = hasDiscount && !coded ? line.match(discountedRow) : null;
    const priceOnly = !hasTotal && !hasDiscount ? line.match(priceOnlyRow) : null;
    const trailing = line.match(rowPattern);
    const leading = trailing ? null : line.match(leadingQuantityPattern);
    if (!coded && !discounted && !priceOnly && ((!trailing && !leading) || hasDiscount)) continue;
    const [, description, quantity, price, total] = coded
      ? ["", coded.description, coded.quantity, coded.price, coded.total]
      : discounted ? ["", discounted[1], discounted[2], discounted[4], discounted[5]]
      : priceOnly ? ["", priceOnly[1], priceOnly[2], priceOnly[3], ""]
      : trailing ?? ["", leading![2], leading![1], leading![3], leading![4]];
    const unitPrice = price.replaceAll(",", "");
    const productId = (coded && matchImportProduct(coded.barcode, products)) || matchImportProduct(description, products);
    const warnings = [];
    if (!productId) warnings.push("Select the matching product.");
    if (!quantity) warnings.push("Quantity is missing or unreadable. Enter it from the invoice.");
    else if (BigInt(quantity) < 1n || BigInt(quantity) > 2147483647n) warnings.push("Check the quantity.");
    if (!unitPrice) warnings.push("Unit price is unreadable. Check the invoice.");
    if (coded && !total) warnings.push("Printed line total is unreadable. Check the invoice.");
    if (coded && (!coded.discount || toMinorUnits(coded.discount) !== 0n)) warnings.push("Check the printed discount and line total.");
    if (discounted && toMinorUnits(discounted[3].replaceAll(",", "")) !== 0n) warnings.push("Check the printed discount and line total.");
    if (quantity && unitPrice && total && toMinorUnits(unitPrice) * BigInt(quantity) !== toMinorUnits(total.replaceAll(",", ""))) warnings.push("Quantity × unit price differs from the printed line total.");
    result.push({ description, productId, quantity, unitPrice, warning: warnings.join(" ") });
  }
  return result;
}
