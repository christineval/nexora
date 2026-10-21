import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listContacts } from "@/server/data/erp-data";
export async function GET(request: Request) { return api(request, async () => { const user = await requireUser("customers"); return listContacts(user, "customers"); }); }
export async function POST(request: Request) { return api(request, async () => { checkOrigin(request); const user = await requireUser("customers", true); const { saveContact } = await import("@/services/contact.service"); return saveContact("customers", await readJson(request), user.id); }, 201); }
