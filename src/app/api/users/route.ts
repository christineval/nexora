import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listUsers, saveUser } from "@/services/user.service";
export async function GET() { return api(async () => { await requireUser("settings"); return listUsers(); }); }
export async function POST(request: Request) { return api(async () => { checkOrigin(request); const user = await requireUser("settings", true); return saveUser(await request.json(), user.id); }, 201); }
