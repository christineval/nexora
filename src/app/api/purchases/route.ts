import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listTransactions } from "@/server/data/erp-data";
export async function GET(request: Request) { return api(request, async () => { const user = await requireUser("purchasing"); return listTransactions(user, "purchasing"); }); }
export async function POST(request: Request) { return api(request, async () => { checkOrigin(request); const user = await requireUser("purchasing", true); const { createTransaction } = await import("@/services/transaction.service"); return createTransaction("purchasing", await readJson(request), user); }, 201); }
