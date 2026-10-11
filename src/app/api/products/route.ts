import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listProducts, createProduct } from "@/services/inventory.service";
import { createProductSchema } from "@/validations/product.schema";
export async function GET() { return api(async () => { await requireUser("inventory"); return listProducts(); }); }
export async function POST(request: Request) { return api(async () => { checkOrigin(request); await requireUser("inventory", true); const row = await createProduct(createProductSchema.parse(await request.json())); return { id: row.id.toString(), sku: row.sku }; }, 201); }
