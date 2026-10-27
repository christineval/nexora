import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { sessionHarness } from "./session-harness.mjs";
import { Prisma } from "@prisma/client";

test("missing rate-limit and session tables return a safe setup error without bypassing protection", async () => {
  const missingTable = code => new Prisma.PrismaClientKnownRequestError("Private SQL details must not reach the response", {
    code, clientVersion: "5.22.0", meta: { code: "42P01", message: "private database details" },
  });
  for (const code of ["P2010", "P2021"]) {
    const api = loadTs("src/lib/api.ts", { "@/lib/rate-limit": {
      RateLimitError: class extends Error {},
      async limitRequest() { if (code === "P2010") throw missingTable(code); },
    } });
    const response = await api.api(new Request("https://example.com/api/auth/guest", {
      method: "POST", headers: { Origin: "https://example.com" },
    }), async () => {
      assert.equal(code, "P2021", "Missing limiter table must block session creation");
      throw missingTable(code);
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.text();
    assert.match(body, /finish the database setup/);
    assert.doesNotMatch(body, /Private SQL|private database|42P01|P2010|P2021/);
  }
});

test("sessions expire exactly at one hour, reject changed passwords and revoke copied tokens", async () => {
  const user = { id: 1n, name: "Actor", role: "ADMIN", password_hash: "original" };
  const { store, sessions } = sessionHarness(user);
  const now = Date.now;
  let instant = now();
  Date.now = () => instant;
  try {
    const token = await store.issueSession(user.id, user.password_hash);
    assert.equal((await store.readSession(token)).id, 1n);
    instant = sessions.get(store.sessionDigest(token)).expires_at.getTime() - 1;
    assert.equal((await store.readSession(token)).id, 1n);
    instant++;
    assert.equal(await store.readSession(token), null);
    instant = now();
    const next = await store.issueSession(user.id, user.password_hash);
    user.password_hash = "changed";
    assert.equal(await store.readSession(next), null);
    await assert.rejects(store.issueSession(user.id, "original"), error => error.status === 401);
    const current = await store.issueSession(user.id, user.password_hash);
    await store.revokeSession(current);
    assert.equal(await store.readSession(current), null);
    assert.equal(await store.readSession("invalid"), null);
  } finally { Date.now = now; }
});

test("fourth login evicts an existing session and simultaneous logins remain capped at three", async () => {
  const user = { id: 1n, name: "Actor", role: "SALES", password_hash: "hash" };
  const { store, sessions } = sessionHarness(user);
  const tokens = [];
  for (let i = 0; i < 4; i++) tokens.push(await store.issueSession(user.id, user.password_hash));
  assert.equal(sessions.size, 3);
  assert.equal((await Promise.all(tokens.map(token => store.readSession(token)))).filter(Boolean).length, 3);
  await Promise.all(Array.from({ length: 10 }, () => store.issueSession(user.id, user.password_hash)));
  assert.equal(sessions.size, 3);
});

test("API limiter returns Retry-After and never runs the blocked operation", async () => {
  const errors = loadTs("src/lib/errors.ts");
  class RateLimitError extends errors.BusinessError { constructor() { super("Too many requests", 429); this.retryAfter = 42; } }
  const api = loadTs("src/lib/api.ts", { "@/lib/errors": errors, "@/lib/rate-limit": { RateLimitError, async limitRequest() { throw new RateLimitError(); } } });
  const response = await api.api(new Request("https://example.com/api/products"), async () => assert.fail("must not run"));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "42");
});

test("rate counters share atomic storage, hash identities and honor the exact threshold", async () => {
  let count = 0;
  const identities = [];
  const limiter = loadTs("src/lib/rate-limit.ts", { "@/lib/prisma": { prisma: { async $queryRaw(strings, ...values) {
    assert.match(strings.join("?"), /ON CONFLICT \(key\) DO UPDATE/);
    assert.equal(values[0].length, 64);
    assert.doesNotMatch(values[0], /@/);
    identities.push(values[0]);
    return [{ count: ++count, retry_after: 15 }];
  } } } });
  for (let i = 0; i < 5; i++) await limiter.consumeLimit("login:user@example.com", 5, 900);
  await assert.rejects(limiter.consumeLimit("login:user@example.com", 5, 900), error => error.status === 429 && error.retryAfter === 15);
  assert.equal(new Set(identities).size, 1);
});

test("client IP headers are ignored unless explicitly trusted and malformed values use the shared bucket", async t => {
  const original = process.env.TRUSTED_CLIENT_IP_HEADER;
  t.after(() => { if (original === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER; else process.env.TRUSTED_CLIENT_IP_HEADER = original; });
  const keys = [];
  const limiter = loadTs("src/lib/rate-limit.ts", { "@/lib/prisma": { prisma: { async $queryRaw(_strings, ...values) { keys.push(values[0]); return [{ count: 1, retry_after: 60 }]; } } } });
  const request = ip => new Request("https://example.com/api/products", { headers: { "x-real-ip": ip } });
  delete process.env.TRUSTED_CLIENT_IP_HEADER;
  await limiter.limitRequest(request("192.0.2.1"));
  await limiter.limitRequest(request("192.0.2.2"));
  assert.equal(keys[0], keys[1]);
  process.env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
  await limiter.limitRequest(request("192.0.2.1"));
  assert.notEqual(keys[0], keys[2]);
  await limiter.limitRequest(request("192.0.2.1, 192.0.2.2"));
  assert.equal(keys[0], keys[3]);
});

test("JSON boundary rejects malformed and oversized bodies without trusting Content-Length", async () => {
  const { readJson } = loadTs("src/lib/api.ts", { "@/lib/rate-limit": {} });
  const request = body => new Request("https://example.com/api/orders", { method: "POST", body });
  assert.equal((await readJson(request('{"ok":true}'))).ok, true);
  await assert.rejects(readJson(request("{")));
  await assert.rejects(readJson(request('"' + "a".repeat(65536) + '"')), error => error.status === 413);
});

test("all API exports use the shared request guard and database calls avoid unsafe raw SQL", () => {
  function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]); }
  for (const file of files("src/app/api").filter(file => file.endsWith("route.ts"))) {
    const source = readFileSync(file, "utf8");
    assert.equal((source.match(/export async function/g) ?? []).length, (source.match(/api\(request, async/g) ?? []).length, file);
    assert.doesNotMatch(source, /request\.json\(/, file);
  }
  for (const file of [...files("src/lib"), ...files("src/services")].filter(file => file.endsWith(".ts"))) assert.doesNotMatch(readFileSync(file, "utf8"), /\$(?:queryRawUnsafe|executeRawUnsafe)/, file);
});
