import { z } from "zod";
import { contactSchema, idSchema, transactionSchema } from "./shared";
import { philippineDate } from "@/lib/feature-list";

export const orderSchema = transactionSchema.omit({ partyId: true }).extend({
  date: transactionSchema.shape.date.refine(value => value <= philippineDate(new Date().toISOString()), "Sales order date cannot be in the future."),
  partyId: idSchema.optional(),
  walkInCustomer: z.object({ name: contactSchema.shape.name }).optional(),
}).superRefine((data, context) => {
  if ((data.partyId !== undefined) === (data.walkInCustomer !== undefined)) {
    context.addIssue({ code: "custom", path: ["partyId"], message: "Select a registered customer or enter a walk-in customer name." });
  }
});

export type OrderInput = z.infer<typeof orderSchema>;
