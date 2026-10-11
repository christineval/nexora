import TransactionManager from "@/components/features/TransactionManager";
import { listContacts } from "@/services/contact.service";
import { listProducts } from "@/services/inventory.service";
import { listTransactions } from "@/services/transaction.service";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function CreatePurchaseOrderPage() {
  const user = await requirePageAccess("purchasing", true);
  
  const [rows, parties, products] = await Promise.all([listTransactions("purchasing"), listContacts("suppliers"), listProducts()]);
  
  return <TransactionManager canEdit={canWrite(user.role, "purchasing")} kind="purchasing" rows={rows} parties={parties} products={products} initialCreate />;
}
