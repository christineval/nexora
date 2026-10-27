import { z } from "zod";
import { philippineDate } from "@/lib/feature-list";
export const idSchema = z.string().regex(/^[1-9]\d{0,18}$/, "Select a valid record.").refine(value => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n, "Invalid ID.");
export const moneySchema = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a non-negative amount with up to two decimal places.");
export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(150),
  email: z.union([z.literal(""), z.string().trim().email().max(255)]),
  phone: z.string().trim().max(30), address: z.string().trim().max(2000),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => {
    const date = new Date(value + "T00:00:00Z");
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Choose a valid calendar date.");
export const pastOrTodayDateSchema = calendarDateSchema.refine(value => value <= philippineDate(new Date().toISOString()), "Date cannot be in the future.");
export const transactionSchema = z.object({
  partyId: idSchema,
  date: pastOrTodayDateSchema,
  items: z.array(z.object({ productId: idSchema, quantity: z.number().int().positive().max(2147483647), unitPrice: moneySchema.optional() })).min(1, "Add at least one product.").max(100)
    .refine(items => new Set(items.map(item => item.productId)).size === items.length, "Each product can appear only once."),
});
export type TransactionInput = z.infer<typeof transactionSchema>;
