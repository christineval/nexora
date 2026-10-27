export function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeBarcode(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s*([-/.])\s*/g, "$1");
}

export function productBarcodesDuplicate(first: { supplierProductCode?: string | null }, second: { supplierProductCode?: string | null }) {
  const code = normalizeBarcode(first.supplierProductCode);
  return !!code && code === normalizeBarcode(second.supplierProductCode);
}

export function productsDuplicate(first: { name: string; size?: string | null }, second: { name: string; size?: string | null }) {
  const firstSize = normalizeIdentity(first.size), secondSize = normalizeIdentity(second.size);
  return normalizeIdentity(first.name) === normalizeIdentity(second.name) && (!firstSize || !secondSize || firstSize === secondSize);
}

export function contactIdentity(contact: { name: string }) {
  return normalizeIdentity(contact.name);
}
