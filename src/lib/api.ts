import "server-only";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { limitRequest, RateLimitError } from "@/lib/rate-limit";
import { BusinessError } from "@/lib/errors";
export async function api(request: Request, operation: () => Promise<unknown>, status = 200) {
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) checkOrigin(request);
    await limitRequest(request);
    return Response.json(await operation(), { status, headers: { "Cache-Control": "no-store" } });
  }
  catch (error) {
    if (error instanceof RateLimitError) return Response.json({ message: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" } });
    if (error instanceof BusinessError) return Response.json({ message: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ message: error.issues[0]?.message ?? "Check the form details." }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ message: "Invalid request." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021" || (error.code === "P2010" && error.meta?.code === "42P01")) {
        console.error("Nexora database setup is incomplete", error.code);
        return Response.json({ message: "Service setup is incomplete. Ask your administrator to finish the database setup." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      if (error.code === "P2002") return Response.json({ message: "A record with this email or code already exists." }, { status: 409 });
      if (error.code === "P2034") return Response.json({ message: "Another operation changed this record. Refresh and try again." }, { status: 409 });
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
