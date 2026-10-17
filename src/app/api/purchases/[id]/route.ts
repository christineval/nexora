import { z } from "zod";
import { api, checkOrigin, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { transactionSchema } from "@/validations/shared";
const actionSchema = z.discriminatedUnion("action", [z.object({ action: z.enum(["confirm", "complete", "cancel"]) }), transactionSchema.extend({ action: z.literal("edit") })]);
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    checkOrigin(request); const user = await requireUser("purchasing", true); const { transitionTransaction, editTransaction } = await import("@/services/transaction.service");
    const data = actionSchema.parse(await readJson(request)); const { id } = await params;
    return data.action === "edit" ? editTransaction("purchasing", id, data, user) : transitionTransaction("purchasing", id, data.action, user);
  });
}
