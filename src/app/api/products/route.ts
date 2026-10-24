import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listProducts } from "@/server/data/erp-data";
import { createProductRequestSchema } from "@/validations/product.schema";
export async function GET(request: Request) { return api(request, async () => { const user = await requireUser("inventory"); return listProducts(user); }); }
export async function POST(request: Request) { return api(request, async () => { checkOrigin(request); const user = await requireUser("inventory", true); const { createProduct } = await import("@/services/inventory.service"); const row = await createProduct(createProductRequestSchema.parse(await readJson(request)), user.id); return { id: row.id.toString(), sku: row.sku }; }, 201); }
