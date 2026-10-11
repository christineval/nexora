import { z } from "zod";
import { api, checkOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { transitionTransaction, editTransaction } from "@/services/transaction.service";
import { transactionSchema } from "@/validations/shared";
const actionSchema = z.discriminatedUnion("action", [z.object({ action: z.enum(["confirm", "complete", "cancel"]) }), transactionSchema.extend({ action: z.literal("edit") })]);
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    checkOrigin(request); const user = await requireUser("sales", true);
    const data = actionSchema.parse(await request.json()); const { id } = await params;
    return data.action === "edit" ? editTransaction("sales", id, data) : transitionTransaction("sales", id, data.action, user.id);
  });
}
