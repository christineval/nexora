import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    checkOrigin(request);
    const user = await requireUser("purchasing", true);
    const { id } = await params;
    const { recordPurchasePayment } = await import("@/services/purchase-payment.service");
    return recordPurchasePayment(id, await readJson(request), user);
  }, 201);
}
