import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";

test("signed sessions reject tampering and changed password hashes and load the role from the database", async t => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-32-characters-minimum";
  t.after(() => { if (originalSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = originalSecret; });
  const cookies = new Map();
  const user = { id: 1n, name: "Test actor", role: "SALES", password_hash: "test-password-hash" };
  const auth = loadTs("src/lib/auth.ts", {
    "next/headers": { async cookies() { return { get: name => cookies.has(name) ? { value: cookies.get(name) } : undefined, set: (name, value) => cookies.set(name, value), delete: name => cookies.delete(name) }; } },
    "next/navigation": { redirect() { throw new Error("Redirected"); } },
    "@/lib/prisma": { prisma: { users: { async findUnique() { return user; } } } },
  });
  assert.equal(await auth.getCurrentUser(), null);
  await auth.createSession(user.id, user.password_hash);
  const token = cookies.get("nexora_session");
  assert.equal((await auth.getCurrentUser()).role, "SALES");
  cookies.delete("nexora_session"); cookies.set("erp_session", token);
  assert.equal((await auth.getCurrentUser()).role, "SALES");
  await auth.createSession(user.id, user.password_hash);
  assert.equal(cookies.has("erp_session"), false);
  await assert.rejects(auth.requireUser("inventory", true));
  await assert.rejects(auth.requireUser("finance"));
  user.role = "ADMIN";
  assert.equal((await auth.requireUser("finance")).role, "ADMIN");
  cookies.set("nexora_session", token + "extra"); assert.equal(await auth.getCurrentUser(), null);
  cookies.set("nexora_session", token); user.password_hash = "changed";
  assert.equal(await auth.getCurrentUser(), null);
  await auth.deleteSession(); assert.equal(cookies.size, 0);
});
test("bcrypt verification supports existing hashes without plaintext persistence", async () => {
  const { verifyPassword, hashPassword } = loadTs("src/lib/password.ts");
  const hash = await hashPassword("Temporary-password-123!");
  assert.equal(await verifyPassword("Temporary-password-123!", hash), true);
  assert.equal(await verifyPassword("incorrect", hash), false);
});


test("guest sessions are signed, expire, and cannot authorize any business writes", async t => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-32-characters-minimum";
  t.after(() => { if (originalSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = originalSecret; });
  const jar = new Map();
  let databaseReads = 0;
  const auth = loadTs("src/lib/auth.ts", {
    "next/headers": { async cookies() { return { get: name => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name, value) => jar.set(name, value), delete: name => jar.delete(name) }; } },
    "next/navigation": { redirect(path) { throw new Error(path); } },
    "@/lib/prisma": { prisma: { users: { async findUnique() { databaseReads++; throw new Error("Guest must not read a database identity"); } } } },
  });
  await auth.createGuestSession();
  const token = jar.get("nexora_session");
  const guest = await auth.getCurrentUser();
  assert.equal(guest.name, "Guest"); assert.equal(guest.role, "GUEST");
  for (const feature of ["sales", "customers", "inventory", "purchasing", "suppliers", "finance", "reports", "settings"]) {
    assert.equal((await auth.requireUser(feature)).role, "GUEST");
    await assert.rejects(auth.requireUser(feature, true), error => error.status === 403);
  }
  await assert.rejects(auth.requirePageAccess("sales", true), /\/sales/);
  await assert.rejects(auth.requirePageAccess("purchasing", true), /\/purchasing/);
  assert.equal(databaseReads, 0);
  jar.set("nexora_session", token + "tampered"); assert.equal(await auth.getCurrentUser(), null);
  jar.set("nexora_session", token);
  const realNow = Date.now;
  Date.now = () => realNow() + 9 * 60 * 60 * 1000;
  try { assert.equal(await auth.getCurrentUser(), null); } finally { Date.now = realNow; }
  await auth.deleteSession(); assert.equal(jar.size, 0);
});

test("guest sign-in requires the request origin and password changes reject guests before database access", async () => {
  let sessions = 0;
  const guestRoute = loadTs("src/app/api/auth/guest/route.ts", {
    "@/lib/auth": { async createGuestSession() { sessions++; } },
  });
  const blocked = await guestRoute.POST(new Request("http://localhost:3000/api/auth/guest", { method: "POST", headers: { Origin: "https://other.example" } }));
  assert.equal(blocked.status, 403); assert.equal(sessions, 0);
  const allowed = await guestRoute.POST(new Request("http://localhost:3000/api/auth/guest", { method: "POST", headers: { Origin: "http://localhost:3000" } }));
  assert.equal(allowed.status, 200); assert.equal(sessions, 1);
  const passwordRoute = loadTs("src/app/api/auth/password/route.ts", {
    "@/lib/auth": { async getCurrentUser() { return { id: 0n, name: "Guest", role: "GUEST" }; } },
    "@/lib/prisma": { prisma: {} },
  });
  const denied = await passwordRoute.POST(new Request("http://localhost:3000/api/auth/password", { method: "POST", headers: { Origin: "http://localhost:3000" } }));
  assert.equal(denied.status, 403);
});
