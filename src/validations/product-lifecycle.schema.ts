import { z } from "zod";

export const productLifecycleSchema = z.object({
  action: z.enum(["archive", "restore"]),
  acknowledgeStock: z.boolean().default(false),
});
export const deleteProductSchema = z.object({
  password: z.string().min(1, "Enter your current password to delete this product.").max(72),
});
