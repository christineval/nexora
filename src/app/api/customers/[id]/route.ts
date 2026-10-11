import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { saveContact, listContacts } from "@/services/contact.service";
import { idSchema } from "@/validations/shared";
import { BusinessError } from "@/lib/errors";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { return api(async () => { await requireUser("customers"); const { id } = await params; idSchema.parse(id); const row = (await listContacts("customers")).find(row => row.id === id); if (!row) throw new BusinessError("Record not found.", 404); return row; }); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return api(async () => { checkOrigin(request); await requireUser("customers", true); return saveContact("customers", await request.json(), (await params).id); }); }
