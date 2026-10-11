import TransactionManager from "@/components/features/TransactionManager";
import { listContacts } from "@/services/contact.service";
import { listProducts } from "@/services/inventory.service";
import { listTransactions } from "@/services/transaction.service";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
import { notFound } from "next/navigation";
import { idSchema } from "@/validations/shared";
export const dynamic = "force-dynamic";
export default async function SalesOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("sales");
  const { id } = await params; if (!idSchema.safeParse(id).success) notFound();
  const [rows, parties, products] = await Promise.all([listTransactions("sales"), listContacts("customers"), listProducts()]);
  if (!rows.some(row => row.id === id)) notFound();
  return <TransactionManager canEdit={canWrite(user.role, "sales")} kind="sales" rows={rows} parties={parties} products={products} initialId={id} />;
}
