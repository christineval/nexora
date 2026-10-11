import { notFound } from "next/navigation";
import Link from "next/link";
import FeatureHeading from "@/components/ui/FeatureHeading";
import ProductTable from "@/components/inventory/ProductTable";
import MovementTable from "@/components/inventory/MovementTable";
import { getProduct, listInventoryMovements } from "@/services/inventory.service";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
import { idSchema } from "@/validations/shared";
export const dynamic = "force-dynamic";
export default async function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("inventory"); const { id } = await params; if (!idSchema.safeParse(id).success) notFound();
  const [product, movements] = await Promise.all([getProduct(id), listInventoryMovements()]); if (!product) notFound();
  return <><Link className="mb-5 inline-block text-sm text-violet-600" href="/inventory/products">← Products</Link><FeatureHeading title={product.name} description={product.sku} /><ProductTable rows={[product]} canEdit={canWrite(user.role, "inventory")} /><div className="mt-8"><FeatureHeading title="Stock history" description="Inventory audit trail for this product" /><MovementTable rows={movements.filter(row => row.productId === id)} /></div></>;
}
