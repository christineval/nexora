import "server-only";
import { listContacts } from "./contact.service";
export async function listSuppliers() { return listContacts("suppliers"); }
