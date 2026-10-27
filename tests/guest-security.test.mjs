import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

const signingSecret = "isolated-guest-security-test-secret-at-least-32-characters";
const id = "9223372036854775807";
function routeFiles(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routeFiles(`${directory}/${entry.name}`) : entry.name === "route.ts" ? [`${directory}/${entry.name}`] : []); }
function signedToken(data) { const payload = Buffer.from(JSON.stringify(data)).toString("base64url"); return payload + "." + createHmac("sha256", signingSecret).update(payload).digest("base64url"); }

async function guestHarness(t) {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = signingSecret;
  t.after(() => { if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous; });
  const jar = new Map();
  const mocks = {
    "@/lib/errors": loadTs("src/lib/errors.ts"),
    "@/lib/rate-limit": { async limitRequest() {}, RateLimitError: class extends Error {} },
    "next/headers": { async cookies() { return { get: name => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name, value) => jar.set(name, value), delete: name => jar.delete(name) }; } },
    "next/navigation": { redirect(path) { throw new Error("redirect:" + path); } },
  };
  for (const name of ["@/lib/prisma", ...readdirSync("src/services").filter(name => name.endsWith(".ts")).map(name => "@/services/" + name.slice(0, -3))]) Object.defineProperty(mocks, name, { enumerable: true, get() { assert.fail("Guest reached protected database/service: " + name); } });
  const auth = loadTs("src/lib/auth.ts", mocks);
  mocks["@/lib/auth"] = auth;
  await auth.createGuestSession();
  return { jar, mocks, auth };
}

test("every implemented business mutation rejects a guest despite spoofed roles, owners, auth and middleware headers", async t => {
  const { mocks } = await guestHarness(t);
  let checked = 0;
  for (const file of routeFiles("src/app/api")) {
    if (/\/auth\/(login|guest|logout)\/route\.ts$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    const methods = [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\(/g)].map(match => match[1]);
    if (!methods.length) continue;
    const route = loadTs(file, mocks);
    for (const method of methods) {
      const path = file.replace("src/app", "").replace("/route.ts", "").replace("[id]", id);
      const response = await route[method](new Request("https://example.com" + path + "?role=ADMIN&created_by=1", {
        method, headers: { Origin: "https://example.com", "Content-Type": "application/json", "x-user-role": "ADMIN", "x-user-id": "1", "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware", Authorization: "Bearer forged-admin" },
        body: JSON.stringify({ role: "ADMIN", userId: "1", created_by: "1", action: "complete", items: [] }),
      }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 403, method + " " + path);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("Vary"), "Cookie");
      checked++;
    }
  }
  assert.ok(checked >= 15, "The test must exercise the full mutation surface.");
});

test("guest administration reads, direct user-data access and create/admin pages are denied before database access", async t => {
  const { mocks, auth } = await guestHarness(t);
  for (const path of ["users", "audit"]) {
    const route = loadTs(`src/app/api/${path}/route.ts`, mocks);
    assert.equal((await route.GET(new Request(`https://example.com/api/${path}?role=ADMIN&userId=1`, { headers: { "x-user-role": "ADMIN" } }))).status, 403);
  }
  const data = loadTs("src/server/data/erp-data.ts", mocks);
  await assert.rejects(data.listUsers(await auth.getCurrentUser()), error => error.status === 403);
  for (const moduleName of ["settings", "audit"]) await assert.rejects(auth.requirePageAccess(moduleName), /redirect:\/dashboard/);
  for (const moduleName of ["sales", "purchasing"]) await assert.rejects(auth.requirePageAccess(moduleName, true), new RegExp("redirect:/" + moduleName));
});

test("cookie payload role claims never create a member identity and unsigned edits cannot authenticate", async t => {
  const { jar, auth } = await guestHarness(t);
  const issued = Date.now();
  const data = { kind: "guest", issued, expires: issued + 3600000, id: "1", role: "ADMIN", created_by: "1" };
  jar.set("nexora_session", signedToken(data));
  const guest = await auth.getCurrentUser();
  assert.equal(guest.id, 0n);
  assert.equal(guest.role, "GUEST");
  await assert.rejects(auth.requireUser("settings", true), error => error.status === 403);
  const original = jar.get("nexora_session");
  const changed = Buffer.from(JSON.stringify({ ...data, kind: "member" })).toString("base64url") + "." + original.split(".")[1];
  jar.set("nexora_session", changed);
  assert.equal(await auth.getCurrentUser(), null);
  jar.set("nexora_session", signedToken({ ...data, kind: "member" }));
  assert.equal(await auth.getCurrentUser(), null);
});

test("guest and unknown navigation roles have no administration links", () => {
  const Sidebar = loadTs("src/components/layout/Sidebar.tsx", { "next/navigation": { usePathname: () => "/dashboard" }, "next/link": { __esModule: true, default: ({ href, children }) => createElement("a", { href }, children) } }).default;
  for (const role of ["GUEST", "unknown", undefined]) {
    const html = renderToStaticMarkup(createElement(Sidebar, { role }));
    assert.doesNotMatch(html, /href="\/settings|Administration/);
  }
});
