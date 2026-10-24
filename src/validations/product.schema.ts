import { z } from "zod";
import { moneySchema } from "./shared";

export const createProductSchema = z.object({
    supplierProductCode: z.string().trim().max(150).optional(),
    name: z.string().trim().min(1, "Product name is required").max(150),
    size: z.string().trim().max(50).optional(),
    unitCost: moneySchema,
    sellingPrice: moneySchema,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export const createProductRequestSchema = createProductSchema.extend({
    quantity: z.number().int().min(0).max(2147483647).default(0),
});
export const updateProductSchema = createProductSchema.extend({ status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]) });
