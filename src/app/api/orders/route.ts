import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listTransactions, createTransaction } from "@/services/transaction.service";
export async function GET() { return api(async () => { await requireUser("sales"); return listTransactions("sales"); }); }
export async function POST(request: Request) { return api(async () => { checkOrigin(request); const user = await requireUser("sales", true); return createTransaction("sales", await request.json(), user.id); }, 201); }
