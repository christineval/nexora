import "server-only";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { BusinessError } from "@/lib/errors";
export async function api(operation: () => Promise<unknown>, status = 200) {
  try { return Response.json(await operation(), { status }); }
  catch (error) {
    if (error instanceof BusinessError) return Response.json({ message: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ message: error.issues[0]?.message ?? "Check the form details." }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ message: "Invalid request." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return Response.json({ message: "A record with this email or code already exists." }, { status: 409 });
      if (error.code === "P2034") return Response.json({ message: "Another operation changed this record. Refresh and try again." }, { status: 409 });
      if (error.code === "P2025") return Response.json({ message: "Record not found." }, { status: 404 });
    }
    console.error("Nexora operation failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ message: "Unable to complete this operation. Please try again." }, { status: 500 });
  }
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) throw new BusinessError("Request origin is not allowed.", 403);
}
