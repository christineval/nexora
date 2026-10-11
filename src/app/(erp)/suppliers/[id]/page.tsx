import { notFound } from "next/navigation";
import Link from "next/link";
import ContactManager from "@/components/features/ContactManager";
import FeatureHeading from "@/components/ui/FeatureHeading";
import TransactionHistory from "@/components/features/TransactionHistory";
import { listContacts } from "@/services/contact.service";
import { listTransactions } from "@/services/transaction.service";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
import { idSchema } from "@/validations/shared";
export const dynamic = "force-dynamic";
export default async function SupplierDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("suppliers"); const { id } = await params; if (!idSchema.safeParse(id).success) notFound();
  const [contacts, transactions] = await Promise.all([listContacts("suppliers"), listTransactions("purchasing")]);
  const contact = contacts.find(row => row.id === id); if (!contact) notFound();
  const history = transactions.filter(row => row.partyId === id);
  return <><Link href="/suppliers" className="mb-5 inline-block text-sm text-violet-600">← Suppliers</Link><ContactManager canEdit={canWrite(user.role, "suppliers")} kind="suppliers" rows={[contact]} /><div className="mt-8"><FeatureHeading title="Purchase history" description={"Transactions for " + contact.name} /><TransactionHistory kind="purchasing" rows={history} /></div></>;
}
