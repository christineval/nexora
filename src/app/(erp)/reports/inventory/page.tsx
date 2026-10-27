import InventoryReport from "@/components/features/InventoryReport";
import { listProducts } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function InventoryReportsPage() { const user = await requirePageAccess("reports"); return <InventoryReport rows={await listProducts(user)} />; }
