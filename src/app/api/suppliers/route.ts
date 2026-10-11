import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listContacts, saveContact } from "@/services/contact.service";
export async function GET() { return api(async () => { await requireUser("suppliers"); return listContacts("suppliers"); }); }
export async function POST(request: Request) { return api(async () => { checkOrigin(request); await requireUser("suppliers", true); return saveContact("suppliers", await request.json()); }, 201); }
