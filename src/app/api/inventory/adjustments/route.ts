import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { adjustStock } from "@/services/adjustment.service";
export async function POST(request: Request) { return api(async () => { checkOrigin(request); const user = await requireUser("inventory", true); return adjustStock(await request.json(), user.id); }, 201); }
