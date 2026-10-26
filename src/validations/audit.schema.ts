import { z } from "zod";
import { idSchema } from "./shared";
import { philippineDate } from "@/lib/feature-list";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid date.").refine(value => value <= philippineDate(new Date().toISOString()), "Filter date cannot be in the future.");
export const auditFilterSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  actorId: idSchema.optional(),
  action: z.string().trim().max(60).regex(/^[A-Z_]+$/).optional(),
  entity: z.enum(["AUTH", "USER", "PRODUCT", "CUSTOMER", "SUPPLIER", "ORDER", "PURCHASE_ORDER", "INVENTORY_MOVEMENT", "LEDGER", "ACCESS"]).optional(),
  outcome: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional(),
  from: date.optional(), to: date.optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to, { message: "Start date must be on or before end date.", path: ["to"] });
