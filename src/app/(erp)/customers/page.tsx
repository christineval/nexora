import ContactManager from "@/components/features/ContactManager";
import { listContacts } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function CustomersPage() { const user = await requirePageAccess("customers"); return <ContactManager canEdit={canWrite(user.role, "customers")} kind="customers" rows={await listContacts(user, "customers")} />; }
