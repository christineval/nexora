import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    checkOrigin(request);
    const user = await requireUser("inventory", true);
    const { changeProductLifecycle } = await import("@/services/product-lifecycle.service");
    return changeProductLifecycle((await params).id, await readJson(request), user);
  });
}
