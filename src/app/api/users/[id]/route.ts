import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { saveUser } from "@/services/user.service";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(async () => { checkOrigin(request); const user = await requireUser("settings", true); return saveUser(await request.json(), user.id, (await params).id); }); }
