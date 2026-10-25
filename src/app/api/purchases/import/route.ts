import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(request: Request) {
  return api(request, async () => {
    checkOrigin(request);
    const user = await requireUser("purchasing", true);
    const { importPurchaseInvoice } = await import("@/services/purchase-invoice.service");
    return importPurchaseInvoice(await readJson(request), user);
  }, 201);
}
