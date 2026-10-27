import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const secret = "isolated-production-guest-security-test-secret-at-least-32-characters";
const origin = "http://localhost:3302";
const absentId = "9223372036854775807";
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : entry.name === "route.ts" ? [`${directory}/${entry.name}`] : []);
function guestToken() { const issued = Date.now(); const payload = Buffer.from(JSON.stringify({ kind: "guest", issued, expires: issued + 3600000 })).toString("base64url"); return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url"); }

test("production HTTP routes deny guest writes and administration even with forged privilege headers", async ({ context }) => {
  test.setTimeout(120000);
  await context.addCookies([{ name: "nexora_session", value: guestToken(), url: origin, httpOnly: true, sameSite: "Lax" }]);
  const headers = { Origin: origin, "x-user-role": "ADMIN", "x-user-id": "1", "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware", Authorization: "Bearer forged-admin" };
  for (const file of files("src/app/api")) {
    if (/\/auth\/(login|guest|logout)\/route\.ts$/.test(file)) continue;
    for (const match of readFileSync(file, "utf8").matchAll(/export async function (POST|PUT|PATCH|DELETE)\(/g)) {
      const path = file.replace("src/app", "").replace("/route.ts", "").replace("[id]", absentId);
      // Invalid business data and a nonexistent ID make these probes harmless
      // even if a future authorization regression causes validation to run.
      const response = await context.request.fetch(path + "?role=ADMIN&created_by=1", { method: match[1], headers, data: { role: "ADMIN", created_by: "1", userId: "1", items: [], quantity: 0, action: "invalid" } });
      expect(response.status(), match[1] + " " + path).toBe(403);
      expect(response.headers()["cache-control"]).toBe("no-store");
    }
  }
  for (const path of ["/api/users", "/api/audit"]) expect((await context.request.get(path + "?role=ADMIN", { headers })).status(), path).toBe(403);
  await context.clearCookies();
  const tampered = guestToken().split(".");
  tampered[0] = Buffer.from(JSON.stringify({ kind: "guest", role: "ADMIN", id: "1", issued: Date.now(), expires: Date.now() + 3600000 })).toString("base64url");
  await context.addCookies([{ name: "nexora_session", value: tampered.join("."), url: origin, httpOnly: true }]);
  expect((await context.request.get("/api/users", { headers })).status()).toBe(401);
});

test("production serves security headers, hides server files and issues a guest-only protected cookie", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-powered-by"]).toBeUndefined();
  for (const path of ["/.env", "/.env.local", "/scripts/create-admin.ts", "/tests/test-session.mjs", "/src/server/demo/guest-snapshot.json", "/prisma/schema.prisma"]) expect((await request.get(path)).status(), path).toBe(404);
  const guest = await request.post("/api/auth/guest", { headers: { Origin: origin }, data: { role: "ADMIN", id: "1" } });
  expect(guest.status()).toBe(200);
  const cookie = guest.headers()["set-cookie"] ?? "";
  for (const flag of [/httponly/i, /secure/i, /samesite=lax/i, /max-age=3600/i]) expect(flag.test(cookie)).toBe(true);
  const token = cookie.match(/nexora_session=([^;]+)/)?.[1];
  expect(Boolean(token)).toBe(true);
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  expect(payload.kind).toBe("guest");
  expect(payload.role).toBeUndefined();
  expect(payload.id).toBeUndefined();
});
