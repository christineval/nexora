import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listContacts } from "@/server/data/erp-data";
export async function GET(request: Request) { return api(request, async () => { const user = await requireUser("suppliers"); return listContacts(user, "suppliers"); }); }
export async function POST(request: Request) { return api(request, async () => { checkOrigin(request); await requireUser("suppliers", true); const { saveContact } = await import("@/services/contact.service"); return saveContact("suppliers", await readJson(request)); }, 201); }
