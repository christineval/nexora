import "server-only";
import { recordAudit } from "@/server/audit";
import { prisma } from "@/lib/prisma";
import { contactSchema, idSchema } from "@/validations/shared";
import { supplierSchema } from "@/validations/supplier.schema";
import { customerSchema } from "@/validations/customer.schema";
import type { ContactRow } from "@/types/features";
export type ContactKind = "customers" | "suppliers";
export async function listContacts(kind: ContactKind): Promise<ContactRow[]> {
  if (kind === "customers") {
    const rows = await prisma.customers.findMany({ orderBy: { name: "asc" } });
    return rows.map(row => ({ id: row.id.toString(), name: row.name, email: row.email, phone: row.phone, address: row.address, status: row.status }));
  }
  const rows = await prisma.suppliers.findMany({ orderBy: { name: "asc" } });
  return rows.map(row => ({ id: row.id.toString(), name: row.name, email: row.email, phone: row.phone, address: row.address, status: row.status, contactPerson: row.contact_person }));
}
export async function saveContact(kind: ContactKind, input: unknown, actorId: bigint, recordId?: string) {
  const id = recordId ? BigInt(idSchema.parse(recordId)) : undefined;
  const value = kind === "customers" ? customerSchema.parse(input) : contactSchema.parse(input);
  const data = { name: value.name, email: value.email || null, phone: value.phone || null, address: value.address || null, status: value.status, updated_at: new Date() };
  return prisma.$transaction(async tx => {
    if (kind === "customers") {
      const before = id ? await tx.customers.findUnique({ where: { id } }) : null;
      const row = id ? await tx.customers.update({ where: { id }, data }) : await tx.customers.create({ data });
      await recordAudit(tx, actorId, { action: id ? "CUSTOMER_UPDATED" : "CUSTOMER_CREATED", entity: "CUSTOMER", entityId: row.id, before, after: { ...row, changed_fields: id ? Object.keys(data).filter(key => key !== "updated_at" && before?.[key as keyof typeof before] !== data[key as keyof typeof data]) : undefined } });
      return { id: row.id.toString() };
    }
    const supplier = { ...data, contact_person: supplierSchema.parse(input).contactPerson || null };
    const before = id ? await tx.suppliers.findUnique({ where: { id } }) : null;
    const row = id ? await tx.suppliers.update({ where: { id }, data: supplier }) : await tx.suppliers.create({ data: supplier });
    await recordAudit(tx, actorId, { action: id ? "SUPPLIER_UPDATED" : "SUPPLIER_CREATED", entity: "SUPPLIER", entityId: row.id, before, after: { ...row, changed_fields: id ? Object.keys(supplier).filter(key => key !== "updated_at" && before?.[key as keyof typeof before] !== supplier[key as keyof typeof supplier]) : undefined } });
    return { id: row.id.toString() };
  }, { isolationLevel: "Serializable" });
}
