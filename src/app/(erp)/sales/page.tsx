import TransactionManager from "@/components/features/TransactionManager";
import { listContacts } from "@/services/contact.service";
import { listProducts } from "@/services/inventory.service";
import { listTransactions } from "@/services/transaction.service";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function SalesOrdersPage() {
  const user = await requirePageAccess("sales");
  
  const [rows, parties, products] = await Promise.all([listTransactions("sales"), listContacts("customers"), listProducts()]);
  
  return <TransactionManager canEdit={canWrite(user.role, "sales")} kind="sales" rows={rows} parties={parties} products={products}  />;
}
