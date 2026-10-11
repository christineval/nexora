import "server-only";
import { prisma } from "@/lib/prisma";
import { contactSchema, idSchema } from "@/validations/shared";
import { supplierSchema } from "@/validations/supplier.schema";
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
export async function saveContact(kind: ContactKind, input: unknown, recordId?: string) {
  const id = recordId ? BigInt(idSchema.parse(recordId)) : undefined;
  const value = contactSchema.parse(input);
  const data = { name: value.name, email: value.email || null, phone: value.phone || null, address: value.address || null, status: value.status, updated_at: new Date() };
  if (kind === "customers") {
    const row = id ? await prisma.customers.update({ where: { id }, data }) : await prisma.customers.create({ data });
    return { id: row.id.toString() };
  }
  const supplier = { ...data, contact_person: supplierSchema.parse(input).contactPerson || null };
  const row = id ? await prisma.suppliers.update({ where: { id }, data: supplier }) : await prisma.suppliers.create({ data: supplier });
  return { id: row.id.toString() };
}
