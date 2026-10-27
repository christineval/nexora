import { notFound } from "next/navigation";
import Link from "next/link";
import ContactManager from "@/components/features/ContactManager";
import FeatureHeading from "@/components/ui/FeatureHeading";
import TransactionHistory from "@/components/features/TransactionHistory";
import { listContacts } from "@/server/data/erp-data";
import { listTransactions } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
import { idSchema } from "@/validations/shared";
export const dynamic = "force-dynamic";
export default async function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("customers"); const { id } = await params; if (!idSchema.safeParse(id).success) notFound();
  const [contacts, transactions] = await Promise.all([listContacts(user, "customers"), listTransactions(user, "sales")]);
  const contact = contacts.find(row => row.id === id); if (!contact) notFound();
  const history = transactions.filter(row => row.partyId === id);
  return <><Link href="/customers" className="mb-5 inline-block text-sm text-violet-600">← Customers</Link><ContactManager canEdit={canWrite(user.role, "customers")} kind="customers" rows={[contact]} /><div className="mt-8"><FeatureHeading title="Sales history" description={"Transactions for " + contact.name} /><TransactionHistory kind="sales" rows={history} /></div></>;
}
