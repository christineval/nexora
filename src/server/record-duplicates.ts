import "server-only";
import type { Prisma } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { contactIdentity, normalizeBarcode, normalizeIdentity, productBarcodesDuplicate, productsDuplicate } from "@/lib/record-identity";

export async function assertNoDuplicateProducts(tx: Prisma.TransactionClient, inputs: { name: string; size?: string | null; supplierProductCode?: string | null }[], excludeId?: bigint) {
  if (!inputs.length) return;
  if (inputs.some((input, index) => inputs.slice(0, index).some(other => productBarcodesDuplicate(input, other)))) throw new BusinessError("Repeated barcode: select the existing product or combine quantities for repeated invoice lines.", 409);
  if (inputs.some((input, index) => inputs.slice(0, index).some(other => productsDuplicate(input, other)))) throw new BusinessError("Repeated product name: use different, non-empty sizes or combine quantities for the same product.", 409);
  // Include coded products so normalized OCR codes also match older spacing and Unicode dashes.
  const candidates = await tx.products.findMany({
    where: { ...(excludeId ? { id: { not: excludeId } } : {}), OR: [...inputs.map(input => ({ name: { contains: normalizeIdentity(input.name).split(" ")[0], mode: "insensitive" as const } })), ...(inputs.some(input => normalizeBarcode(input.supplierProductCode)) ? [{ supplier_product_code: { not: null } }] : [])] },
    select: { id: true, name: true, size: true, supplier_product_code: true },
  });
  if (candidates.some(product => inputs.some(input => productBarcodesDuplicate({ supplierProductCode: product.supplier_product_code }, input)))) throw new BusinessError("A product with this barcode already exists. Select the existing product; check archived products too.", 409);
  if (candidates.some(product => inputs.some(input => productsDuplicate(product, input)))) throw new BusinessError("This product name already exists. Matching names require different, non-empty sizes. Select the existing product or check archived products.", 409);
}

export async function assertNoDuplicateContact(tx: Prisma.TransactionClient, kind: "customers" | "suppliers", input: { name: string; email?: string | null; phone?: string | null }, excludeId?: bigint) {
  const query = {
    where: { ...(excludeId ? { id: { not: excludeId } } : {}), name: { contains: normalizeIdentity(input.name).split(" ")[0], mode: "insensitive" as const } },
    select: { id: true, name: true, email: true, phone: true },
  };
  const candidates = kind === "customers" ? await tx.customers.findMany(query) : await tx.suppliers.findMany(query);
  if (candidates.some(contact => contactIdentity(contact) === contactIdentity(input))) throw new BusinessError(`A ${kind === "customers" ? "customer" : "supplier"} with this name already exists. Edit the existing record instead.`, 409);
}

export async function assertNoDuplicateUserEmail(tx: Prisma.TransactionClient, email: string, excludeId?: bigint) {
  const existing = await tx.users.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (existing) throw new BusinessError("A user with this email already exists. Use a different email or edit the existing user.", 409);
}
