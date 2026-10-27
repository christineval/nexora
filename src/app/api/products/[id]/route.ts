import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getProduct } from "@/server/data/erp-data";
import { idSchema } from "@/validations/shared";
import { BusinessError } from "@/lib/errors";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(request, async () => { const user = await requireUser("inventory"); const id = idSchema.parse((await params).id); const row = await getProduct(user, id); if (!row) throw new BusinessError("Product not found.", 404); return row; }); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(request, async () => { checkOrigin(request); const user = await requireUser("inventory", true); const { updateProduct } = await import("@/services/inventory.service"); return updateProduct((await params).id, await readJson(request), user.id); }); }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    checkOrigin(request);
    const user = await requireUser("inventory", true);
    if (user.role !== "ADMIN") throw new BusinessError("Only an administrator can permanently delete products.", 403);
    const { permanentlyDeleteProduct } = await import("@/services/product-lifecycle.service");
    return permanentlyDeleteProduct((await params).id, await readJson(request), user);
  });
}
