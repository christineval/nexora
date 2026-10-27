import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listUsers } from "@/server/data/erp-data";
export async function GET(request: Request) { return api(request, async () => { const user = await requireUser("settings"); return listUsers(user); }); }
export async function POST(request: Request) { return api(request, async () => { checkOrigin(request); const user = await requireUser("settings", true); const { saveUser } = await import("@/services/user.service"); return saveUser(await readJson(request), user.id); }, 201); }
