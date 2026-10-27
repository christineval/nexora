import { z } from "zod";
import { moneySchema } from "./shared";
import { toMinorUnits } from "@/lib/money";

export const createProductSchema = z.object({
    supplierProductCode: z.string().trim().max(150).optional(),
    name: z.string().trim().min(1, "Product name is required").max(150),
    size: z.string().trim().max(50).optional(),
    unitCost: z.string({ error: "Unit cost is required." }).min(1, "Unit cost is required.").pipe(moneySchema),
    sellingPrice: z.string({ error: "Selling price is required." }).min(1, "Selling price is required.").pipe(moneySchema),
}).refine(data => !moneySchema.safeParse(data.unitCost).success || !moneySchema.safeParse(data.sellingPrice).success || toMinorUnits(data.sellingPrice) >= toMinorUnits(data.unitCost), {
    path: ["sellingPrice"], message: "Selling price cannot be lower than unit cost.",
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export const createProductRequestSchema = createProductSchema.safeExtend({
    quantity: z.number().int().min(0).max(2147483647).default(0),
});
export const updateProductSchema = createProductSchema.safeExtend({ status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]) });
