import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { updateProduct, getProduct } from "@/services/inventory.service";
import { idSchema } from "@/validations/shared";
import { BusinessError } from "@/lib/errors";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { return api(async () => { await requireUser("inventory"); const id = idSchema.parse((await params).id); const row = await getProduct(id); if (!row) throw new BusinessError("Product not found.", 404); return row; }); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(async () => { checkOrigin(request); await requireUser("inventory", true); return updateProduct((await params).id, await request.json()); }); }
