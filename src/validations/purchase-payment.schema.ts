import { z } from "zod";
import { calendarDateSchema, moneySchema } from "./shared";
import { toMinorUnits } from "@/lib/money";
import { philippineDate } from "@/lib/feature-list";

export const purchasePaymentSchema = z.object({
  paymentKey: z.uuid().transform(value => value.toLowerCase()),
  amount: moneySchema.pipe(z.string().refine(value => toMinorUnits(value) > 0n, "Payment must be greater than zero.")),
  date: calendarDateSchema.refine(value => value <= philippineDate(new Date().toISOString()), "Payment date cannot be in the future."),
  reference: z.string().trim().max(150).default(""),
});
