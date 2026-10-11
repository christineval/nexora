import AddProductModal from "@/components/inventory/AddProductModal";
import ProductTable from "@/components/inventory/ProductTable";
import { getNextProductSku, listProducts } from "@/services/inventory.service";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requirePageAccess("inventory");
  const canEdit = canWrite(user.role, "inventory");
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const [rows, nextSku] = await Promise.all([listProducts(), getNextProductSku()]);
  return <section aria-labelledby="products-heading">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><h1 id="products-heading" className="text-2xl font-bold tracking-tight">Products</h1><p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">Manage your product inventory</p></div>
      {canEdit && <AddProductModal nextSku={nextSku} />}
    </div>
    <ProductTable key={query} rows={rows} initialQuery={query} canEdit={canEdit} />
  </section>;
}
