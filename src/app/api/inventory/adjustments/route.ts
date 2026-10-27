import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
export async function POST(request: Request) { return api(request, async () => { checkOrigin(request); const user = await requireUser("inventory", true); const { adjustStock } = await import("@/services/adjustment.service"); return adjustStock(await readJson(request), user.id); }, 201); }
