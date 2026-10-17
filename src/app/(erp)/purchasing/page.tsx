import TransactionManager from "@/components/features/TransactionManager";
import { listContacts } from "@/server/data/erp-data";
import { listProducts } from "@/server/data/erp-data";
import { listTransactions } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function PurchaseOrdersPage() {
  const user = await requirePageAccess("purchasing");
  
  const [rows, parties, products] = await Promise.all([listTransactions(user, "purchasing"), listContacts(user, "suppliers"), listProducts(user)]);
  
  return <TransactionManager canEdit={canWrite(user.role, "purchasing")} kind="purchasing" rows={rows} parties={parties} products={products}  />;
}
