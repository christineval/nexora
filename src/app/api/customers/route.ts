import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listContacts, saveContact } from "@/services/contact.service";
export async function GET() { return api(async () => { await requireUser("customers"); return listContacts("customers"); }); }
export async function POST(request: Request) { return api(async () => { checkOrigin(request); await requireUser("customers", true); return saveContact("customers", await request.json()); }, 201); }
