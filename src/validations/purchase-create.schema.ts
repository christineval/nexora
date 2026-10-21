import { z } from "zod";
import { createProductSchema } from "./product.schema";
import { idSchema, transactionSchema } from "./shared";

const quantity = z.number().int().positive().max(2147483647);
const existingItem = z.object({ productId: idSchema, quantity, newProduct: z.never().optional() });
const newItem = z.object({ newProduct: createProductSchema, quantity, productId: z.never().optional() });

export const purchaseCreateSchema = transactionSchema.omit({ items: true }).extend({
  items: z.array(z.union([existingItem, newItem], { error: "Choose an existing product or complete the new product name, cost and selling price." })).min(1, "Add at least one product.").max(100),
}).superRefine((data, context) => {
  const existing = new Set<string>();
  const added = new Set<string>();
  data.items.forEach((item, index) => {
    const key = item.newProduct
      ? JSON.stringify([item.newProduct.name.toLowerCase(), (item.newProduct.size ?? "").toLowerCase()])
      : item.productId;
    if (key === undefined) return;
    const seen = item.newProduct ? added : existing;
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["items", index], message: "Each product can appear only once. Combine quantities for repeated products." });
    seen.add(key);
  });
});

export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>;
