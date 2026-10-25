import { z } from "zod";
import { roles } from "../lib/access";
export const userSchema = z.object({ name: z.string().trim().min(1, "Name is required.").max(100), email: z.string().trim().email("Enter a valid email address.").max(255), role: z.enum(roles), password: z.string().min(12, "Use at least 12 characters.").max(72, "Use at most 72 characters.").refine(value => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 bytes.") });
export const updateUserSchema = userSchema.omit({ password: true });
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1, "Current password is required.").max(72), password: userSchema.shape.password, confirmPassword: z.string() }).refine(data => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "New passwords must match." });
