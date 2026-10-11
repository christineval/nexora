import { z } from "zod";
import { roles } from "../lib/access";
export const userSchema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(255), role: z.enum(roles), password: z.string().min(12, "Use at least 12 characters.").max(72, "Use at most 72 characters.").refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 bytes.") });
export const updateUserSchema = userSchema.omit({ password: true });
