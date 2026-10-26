import MovementTable from "@/components/inventory/MovementTable";
import { listInventoryMovements, listProducts } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
import AdjustStockModal from "@/components/inventory/AdjustStockModal";

export const dynamic = "force-dynamic";

export default async function InventoryMovements() {
  const user = await requirePageAccess("inventory");
  const [rows, products] = await Promise.all([listInventoryMovements(user), listProducts(user)]);
  return <section aria-labelledby="movements-heading">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div>
      <h1 id="movements-heading" className="text-2xl font-bold tracking-tight">Inventory Movements</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">Track all inventory changes</p>
    </div>{canWrite(user.role, "inventory") && <AdjustStockModal products={products} />}</header>
    <MovementTable rows={rows} />
  </section>;
}
