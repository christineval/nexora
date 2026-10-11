import { z } from "zod";
import { contactSchema } from "./shared";
export const supplierSchema = contactSchema.extend({ contactPerson: z.string().trim().max(150) });
