import TransactionManager from "@/components/features/TransactionManager";
import { listContacts } from "@/server/data/erp-data";
import { listProducts } from "@/server/data/erp-data";
import { listTransactions } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
import { notFound } from "next/navigation";
import { idSchema } from "@/validations/shared";
export const dynamic = "force-dynamic";
export default async function PurchaseOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("purchasing");
  const { id } = await params; if (!idSchema.safeParse(id).success) notFound();
  const [rows, parties, products] = await Promise.all([listTransactions(user, "purchasing"), listContacts(user, "suppliers"), listProducts(user)]);
  if (!rows.some(row => row.id === id)) notFound();
  return <TransactionManager canEdit={canWrite(user.role, "purchasing")} kind="purchasing" rows={rows} parties={parties} products={products} initialId={id} />;
}
