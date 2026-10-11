import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listTransactions, createTransaction } from "@/services/transaction.service";
export async function GET() { return api(async () => { await requireUser("purchasing"); return listTransactions("purchasing"); }); }
export async function POST(request: Request) { return api(async () => { checkOrigin(request); const user = await requireUser("purchasing", true); return createTransaction("purchasing", await request.json(), user.id); }, 201); }
