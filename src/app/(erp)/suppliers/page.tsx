import ContactManager from "@/components/features/ContactManager";
import { listContacts } from "@/services/contact.service";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function SuppliersPage() { const user = await requirePageAccess("suppliers"); return <ContactManager canEdit={canWrite(user.role, "suppliers")} kind="suppliers" rows={await listContacts("suppliers")} />; }
