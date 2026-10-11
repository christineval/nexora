import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BusinessError } from "@/lib/errors";
import { canAccess, canWrite, type Module } from "@/lib/access";

export type CurrentUser = { id: bigint; name: string; role: string };
const cookieName = "nexora_session";
const previousCookieName = "erp_session";
const lifetime = 8 * 60 * 60;
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new BusinessError("Sign-in is not configured. Ask your administrator to set SESSION_SECRET.", 503);
  return value;
}
function signature(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
function fingerprint(hash: string) { return createHash("sha256").update(hash).digest("hex"); }
export async function createSession(id: bigint, hash: string) {
  const payload = Buffer.from(JSON.stringify({ id: id.toString(), expires: Date.now() + lifetime * 1000, fingerprint: fingerprint(hash) })).toString("base64url");
  (await cookies()).set(cookieName, payload + "." + signature(payload), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: lifetime });
  (await cookies()).delete(previousCookieName);
}
export async function createGuestSession() {
  const payload = Buffer.from(JSON.stringify({ kind: "guest", expires: Date.now() + lifetime * 1000 })).toString("base64url");
  const jar = await cookies();
  jar.set(cookieName, payload + "." + signature(payload), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: lifetime });
  jar.delete(previousCookieName);
}
export async function deleteSession() { const jar = await cookies(); jar.delete(cookieName); jar.delete(previousCookieName); }
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value ?? jar.get(previousCookieName)?.value;
  if (!token) return null;
  try {
    const [payload, supplied, extra] = token.split(".");
    if (!payload || !supplied || extra) return null;
    const expected = signature(payload);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { kind?: unknown; id?: unknown; expires?: unknown; fingerprint?: unknown };
    if (typeof data.expires !== "number" || !Number.isFinite(data.expires) || data.expires <= Date.now()) return null;
    // Guest is a built-in identity, never a database actor for business writes.
    if (data.kind === "guest") return { id: 0n, name: "Guest", role: "GUEST" };
    if (typeof data.id !== "string" || !/^[1-9]\d{0,18}$/.test(data.id) || typeof data.expires !== "number" || data.expires <= Date.now()) return null;
    const user = await prisma.users.findUnique({ where: { id: BigInt(data.id) }, select: { id: true, name: true, role: true, password_hash: true } });
    if (!user || fingerprint(user.password_hash) !== data.fingerprint) return null;
    return { id: user.id, name: user.name, role: user.role };
  } catch { return null; }
}
export async function requireUser(module: Module, write = false) {
  const user = await getCurrentUser();
  if (!user) throw new BusinessError("Please sign in to continue.", 401);
  if (!(write ? canWrite(user.role, module) : canAccess(user.role, module))) throw new BusinessError("Your role does not allow this operation.", 403);
  return user;
}
export async function requirePageAccess(module: Module, write = false) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.role, module)) redirect("/dashboard");
  if (write && !canWrite(user.role, module)) redirect(module === "sales" ? "/sales" : module === "purchasing" ? "/purchasing" : "/dashboard");
  return user;
}
