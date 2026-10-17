import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listContacts } from "@/server/data/erp-data";
import { idSchema } from "@/validations/shared";
import { BusinessError } from "@/lib/errors";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(request, async () => { const user = await requireUser("customers"); const { id } = await params; idSchema.parse(id); const row = (await listContacts(user, "customers")).find(row => row.id === id); if (!row) throw new BusinessError("Record not found.", 404); return row; }); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(request, async () => { checkOrigin(request); await requireUser("customers", true); const { saveContact } = await import("@/services/contact.service"); return saveContact("customers", await readJson(request), (await params).id); }); }
