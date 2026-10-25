import "server-only";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { limitRequest, RateLimitError } from "@/lib/rate-limit";
import { BusinessError } from "@/lib/errors";
import { validationMessages } from "@/lib/validation-errors";
export async function api(request: Request, operation: () => Promise<unknown>, status = 200) {
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) checkOrigin(request);
    await limitRequest(request);
    return Response.json(await operation(), { status, headers: { "Cache-Control": "no-store" } });
  }
  catch (error) {
    if (error instanceof RateLimitError) return Response.json({ message: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" } });
    if (error instanceof BusinessError) return Response.json({ message: error.message }, { status: error.status });
    if (error instanceof ZodError) {
      const errors = validationMessages(error.issues, new URL(request.url).pathname.startsWith("/api/purchases") ? "Invoice line" : "Line");
      return Response.json({ message: errors[0] ?? "Check the form details.", errors }, { status: 400 });
    }
    if (error instanceof SyntaxError) return Response.json({ message: "Invalid request." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Nexora database connection failed", { code: error.errorCode });
      return Response.json({ message: "The database connection is unavailable. Please try again shortly or ask your administrator to check the connection." }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const path = new URL(request.url).pathname;
      const invoiceImport = path === "/api/purchases/import";
      console.error("Nexora database operation failed", { code: error.code, path });
      if (error.code === "P2028") return Response.json({ message: invoiceImport ? "Saving exceeded the database transaction time limit. Keep this invoice form open and retry the save." : "Saving exceeded the database transaction time limit. Please try again." }, { status: 503 });
      if (error.code === "P2024") return Response.json({ message: "The database is busy and could not start this operation. Please try again shortly." }, { status: 503 });
      if (error.code === "P2022") return Response.json({ message: "The database schema is out of date. Ask your administrator to apply the pending database updates." }, { status: 503 });
      if (error.code === "P2021" || (error.code === "P2010" && error.meta?.code === "42P01")) {
        console.error("Nexora database setup is incomplete", error.code);
        return Response.json({ message: "Service setup is incomplete. Ask your administrator to finish the database setup." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      if (error.code === "P2002") {
        const target = error.meta?.target;
        return Response.json({ message: Array.isArray(target) && target.includes("sku") ? "A generated product SKU already exists. Ask your administrator to check product SKU generation." : "A record with this email or code already exists." }, { status: 409 });
      }
      if (error.code === "P2003") {
        if (request.method === "DELETE" && /^\/api\/products\/[^/]+$/.test(path)) return Response.json({ message: "This product is referenced by business records and cannot be deleted. Keep it archived." }, { status: 409 });
        const field = String(error.meta?.field_name ?? "").toLowerCase();
        const message = field.includes("supplier") ? "The selected supplier no longer exists. Select an active supplier."
          : field.includes("product") ? "A selected product no longer exists. Review the products before saving."
          : field.includes("user") ? "Your user account is no longer available. Sign in again before saving."
          : "A selected supplier, product, or user no longer exists. Check the selected records before saving.";
        return Response.json({ message }, { status: 409 });
      }
      if (error.code === "P2034") return Response.json({ message: invoiceImport ? "Inventory changed while this invoice was saving. Keep this form open and retry the save." : "Another operation changed this record. Refresh and try again." }, { status: 409 });
      if (error.code === "P2025") return Response.json({ message: "Record not found." }, { status: 404 });
    }
    console.error("Nexora operation failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ message: "Unable to complete this operation. Please try again." }, { status: 500 });
  }
}
export async function readJson(request: Request): Promise<unknown> {
  const maximum = 64 * 1024;
  if (Number(request.headers.get("content-length")) > maximum) throw new BusinessError("Request body is too large.", 413);
  if (!request.body) throw new BusinessError("Invalid request.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new BusinessError("Request body is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) throw new BusinessError("Request origin is not allowed.", 403);
}
