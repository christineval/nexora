import "server-only";
import { listContacts } from "./contact.service";
export async function listCustomers() { return listContacts("customers"); }
export async function getCustomer(id: string) { return (await listCustomers()).find(row => row.id === id) ?? null; }
