import { z } from "zod";
import { idSchema } from "./shared";
export const adjustmentSchema = z.object({ productId: idSchema, type: z.enum(["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]), quantity: z.number().int().positive().max(2147483647) });
