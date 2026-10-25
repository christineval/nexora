import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BusinessError } from "@/lib/errors";
import { canAccess, canWrite, type Module } from "@/lib/access";

export type CurrentUser = { id: bigint; name: string; role: string };
const cookieName = "nexora_session";
const previousCookieName = "erp_session";
const lifetime = 60 * 60;
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new BusinessError("Sign-in is not configured. Ask your administrator to set SESSION_SECRET.", 503);
  return value;
}
function signature(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
export async function createSession(id: bigint, hash: string) {
  const { issueSession } = await import("@/lib/session-store");
  const token = await issueSession(id, hash);
  const jar = await cookies();
  jar.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: lifetime });
  jar.delete(previousCookieName);
}
export async function createGuestSession() {
  const issued = Date.now();
  const payload = Buffer.from(JSON.stringify({ kind: "guest", issued, expires: issued + lifetime * 1000 })).toString("base64url");
  const jar = await cookies();
  jar.set(cookieName, payload + "." + signature(payload), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: lifetime });
  jar.delete(previousCookieName);
}
export async function deleteSession() { const jar = await cookies(); const token = jar.get(cookieName)?.value; if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) await (await import("@/lib/session-store")).revokeSession(token); jar.delete(cookieName); jar.delete(previousCookieName); }
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) return (await import("@/lib/session-store")).readSession(token);
  try {
    const [payload, supplied, extra] = token.split(".");
    if (!payload || !supplied || extra) return null;
    const expected = signature(payload);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { kind?: unknown; issued?: unknown; id?: unknown; expires?: unknown; fingerprint?: unknown };
    if (typeof data.expires !== "number" || !Number.isFinite(data.expires) || data.expires <= Date.now()) return null;
    if (typeof data.issued !== "number" || !Number.isFinite(data.issued) || data.issued > Date.now() || data.expires - data.issued > lifetime * 1000 || data.expires <= data.issued) return null;
    // Guest is a built-in identity, never a database actor for business writes.
    if (data.kind === "guest") return { id: 0n, name: "Guest", role: "GUEST" };
    return null;
  } catch { return null; }
}
export async function requireUser(module: Module, write = false) {
  const user = await getCurrentUser();
  if (!user) throw new BusinessError("Please sign in to continue.", 401);
  if (!(write ? canWrite(user.role, module) : canAccess(user.role, module))) {
    if (user.role !== "GUEST") {
      await (await import("@/server/audit")).recordSecurityEvent(user, { action: "ACCESS_DENIED", entity: "ACCESS", outcome: "DENIED", after: { module, operation: write ? "WRITE" : "READ" } });
    }
    throw new BusinessError("Your role does not allow this operation.", 403);
  }
  return user;
}
export async function requirePageAccess(module: Module, write = false) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.role, module)) {
    if (user.role !== "GUEST") await (await import("@/server/audit")).recordSecurityEvent(user, { action: "ACCESS_DENIED", entity: "ACCESS", outcome: "DENIED", after: { module, operation: "READ" } });
    redirect("/dashboard");
  }
  // Guests may open creation pages to preview forms; API write authorization stays unchanged.
  if (write && user.role !== "GUEST" && !canWrite(user.role, module)) redirect(module === "sales" ? "/sales" : module === "purchasing" ? "/purchasing" : "/dashboard");
  return user;
}
