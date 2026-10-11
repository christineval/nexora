import InventoryReport from "@/components/features/InventoryReport";
import { listProducts } from "@/services/inventory.service";
import { requirePageAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function InventoryReportsPage() { await requirePageAccess("reports"); return <InventoryReport rows={await listProducts()} />; }
