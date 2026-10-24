import { toMinorUnits } from "./money";
import type { ProductRow } from "@/types/views";

export type ImportedPurchaseLine = {
  description: string;
  supplierProductCode: string;
  matchStatus: "code" | "name" | "suggested" | "unmatched" | "ambiguous" | "confirmed";
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
const codedRow = /^(.*?)\s+([A-Z0-9]+(?:[-~][A-Z0-9./]+)+)\s+((?:[\dOo]+[.,][\dOo?%¢]+|\?)\s+.+)$/i;
const printedMoney = /^(?:PHP\s*|₱\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})$/i;
const units = /^(?:[^\p{L}\p{N}]*(\d+|\?)[\s()\[\]{}|/\\.,:;-]*)?(?:pcs?|pieces?|pairs?|reams?|packs?|boxes?|bottles?|sets?)\b[\s.,:;-]*/iu;

function parseCodedRow(line: string, hasBarcode: boolean) {
  const match = line.match(hasBarcode ? /^(.*?)\s+(\S+)\s+((?:[\dOo]+[.,][\dOo?%¢]+|\?)(?:\s+\S+){2,4})$/i : codedRow);
  if (!match) return null;
  const [, prefix, barcode, columns] = match;
  const values = columns.trim().split(/\s+/);
  if (!/^(?:[\dOo]+[.,][\dOo?%¢]+|\?)$/.test(values[0])) return null;
  // Keep damaged numeric cells blank rather than shifting later columns left.
  if (values.length < 3 || values.length > 5) return null;
  const price = values[1].match(printedMoney)?.[1].replaceAll(",", "") ?? "";
  const total = values.slice(2).join(" ").match(printedMoney)?.[1].replaceAll(",", "") ?? "";
  const unit = prefix.match(units);
  const bareQuantity = prefix.match(/^(\d+|\?)\s+/);
  return {
    description: (unit ? prefix.slice(unit[0].length) : prefix.slice(bareQuantity?.[0].length ?? 0)).trim(),
    quantity: unit?.[1] === "?" ? "" : unit?.[1] ?? (bareQuantity?.[1] === "?" ? "" : bareQuantity?.[1]) ?? "",
    price, total, barcode,
    discount: values[0].match(printedMoney)?.[1].replaceAll(",", "") ?? "",
  };
}

export function normalizeImportName(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function matchImportProduct(description: string, products: ProductRow[]) {
  const name = normalizeImportName(description);
  if (!name) return "";
  const matches = products.filter(product => product.status === "ACTIVE" && [product.sku, product.name, [product.name, product.size].filter(Boolean).join(" ")].some(value => normalizeImportName(value) === name));
  return matches.length === 1 ? matches[0].productId : "";
}

export function normalizeSupplierCode(value: string) {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s*([-/.])\s*/g, "$1");
}

function importNameWithoutPrefix(value: string) {
  return normalizeImportName(value.replace(/^[\p{L}\p{N}]{1,8}\s*,\s*/u, ""));
}

function similarImportName(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));
  const common = [...leftWords].filter(word => rightWords.has(word)).length;
  return common >= 2 && 2 * common / (leftWords.size + rightWords.size) >= 0.8;
}

export function matchImportLine(description: string, supplierProductCode: string, products: ProductRow[]) {
  const code = normalizeSupplierCode(supplierProductCode);
  const active = products.filter(product => product.status === "ACTIVE");
  if (code) {
    // Normalize typography while preserving punctuation, digits and leading zeros.
    const matches = active.filter(product => normalizeSupplierCode(product.supplierProductCode ?? "") === code);
    if (matches.length === 1) return { productId: matches[0].productId, matchStatus: "code" as const };
    if (matches.length > 1) return { productId: "", matchStatus: "ambiguous" as const };
  }
  const name = normalizeImportName(description);
  const exactNames = name ? active.filter(product => [product.sku, product.name, [product.name, product.size].filter(Boolean).join(" ")].some(value => normalizeImportName(value) === name)) : [];
  if (exactNames.length > 1) return { productId: "", matchStatus: "ambiguous" as const };
  if (exactNames.length === 1) {
    const product = exactNames[0];
    const conflictingCode = !!code && !!normalizeSupplierCode(product.supplierProductCode ?? "");
    return { productId: product.productId, matchStatus: conflictingCode ? "suggested" as const : "name" as const };
  }
  const comparableName = importNameWithoutPrefix(description);
  const suggestions = active.filter(product => [product.name, [product.name, product.size].filter(Boolean).join(" ")].some(value => similarImportName(comparableName, importNameWithoutPrefix(value))));
  if (suggestions.length === 1) return { productId: suggestions[0].productId, matchStatus: "suggested" as const };
  return { productId: "", matchStatus: suggestions.length > 1 ? "ambiguous" as const : "unmatched" as const };
}

export function parsePurchaseText(text: string, products: ProductRow[]): ImportedPurchaseLine[] {
  const result: ImportedPurchaseLine[] = [];
  let hasTotal = true;
  let hasDiscount = false;
  let hasBarcode = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/[\t|]+/g, " ").replace(/\s+/g, " ");
    if (!line || summary.test(line.replace(/^[^\p{L}\p{N}]+/u, ""))) continue;
    if (/^barcode$/i.test(line) || (/\bbarcode\b/i.test(line) && /\b(?:descriptions?|qty|quantity|disc\.?|price|total)\b/i.test(line))) { hasBarcode = true; continue; }
    if (/\b(?:description[s]?|product[s]?|item[s]?)\b/i.test(line) && /\b(?:qty|quantity)\b/i.test(line) && /\bprice\b/i.test(line)) {
      hasTotal = /\btotal\b/i.test(line);
      hasDiscount = /\bdisc(?:ount)?\.?/i.test(line);
      continue;
    }
    const coded = parseCodedRow(line, hasBarcode);
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
    const supplierProductCode = coded?.barcode ?? "";
    const { productId, matchStatus } = matchImportLine(description, supplierProductCode, products);
    const warnings = [];
    if (!productId) warnings.push("Select the matching product.");
    if (!quantity) warnings.push("Quantity is missing or unreadable. Enter it from the invoice.");
    else if (BigInt(quantity) < 1n || BigInt(quantity) > 2147483647n) warnings.push("Check the quantity.");
    if (!unitPrice) warnings.push("Unit price is unreadable. Check the invoice.");
    if (coded && !total) warnings.push("Printed line total is unreadable. Check the invoice.");
    if (coded && (!coded.discount || toMinorUnits(coded.discount) !== 0n)) warnings.push("Check the printed discount and line total.");
    if (discounted && toMinorUnits(discounted[3].replaceAll(",", "")) !== 0n) warnings.push("Check the printed discount and line total.");
    if (quantity && unitPrice && total && toMinorUnits(unitPrice) * BigInt(quantity) !== toMinorUnits(total.replaceAll(",", ""))) warnings.push("Quantity × unit price differs from the printed line total.");
    result.push({ description, supplierProductCode, matchStatus, productId, quantity, unitPrice, warning: warnings.join(" ") });
  }
  return result;
}
