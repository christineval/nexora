import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(request, async () => { checkOrigin(request); const user = await requireUser("settings", true); const { saveUser } = await import("@/services/user.service"); return saveUser(await readJson(request), user.id, (await params).id); }); }
