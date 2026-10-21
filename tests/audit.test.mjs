import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";
import { sessionHarness } from "./session-harness.mjs";

const admin = { id: 1n, name: "Administrator", role: "ADMIN" };

test("audit snapshots exclude credentials and contact details recursively and preserve decimal precision", () => {
  const { auditSnapshot } = loadTs("src/server/audit.ts");
  const snapshot = auditSnapshot({
    id: 9007199254740993n, selling_price: new Prisma.Decimal("9999999999.99"),
    order_date: new Date("2026-10-21T00:00:00Z"), password: "secret", password_hash: "hash",
    token_hash: "token", email: "private@example.com", phone: "09123456789", address: "Private address",
    order_items: [{ product_id: 2n, quantity: 3, line_total: new Prisma.Decimal("0.30"), password_hash: "nested secret" }],
  });
  assert.equal(snapshot.id, "9007199254740993");
  assert.equal(snapshot.selling_price, "9999999999.99");
  assert.equal(snapshot.order_date, "2026-10-21T00:00:00.000Z");
  assert.equal(snapshot.order_items[0].line_total, "0.3");
  assert.doesNotMatch(JSON.stringify(snapshot), /secret|hash|token|private|09123456789|address|email|phone/);
});

test("audit entries retain server identity snapshots after later role and name changes", async () => {
  const events = [];
  const actor = { ...admin };
  const { recordAudit } = loadTs("src/server/audit.ts");
  const tx = { users: { async findUnique() { return actor; } }, audit_logs: { async create({ data }) { events.push(data); } } };
  await recordAudit(tx, actor.id, { action: "PRODUCT_UPDATED", entity: "PRODUCT", entityId: 4n, before: { selling_price: "10.00" }, after: { selling_price: "12.00" } });
  actor.role = "SALES"; actor.name = "Renamed";
  assert.equal(events[0].actor_name, "Administrator");
  assert.equal(events[0].actor_role, "ADMIN");
  assert.equal(events[0].entity_id, 4n);
  assert.equal(events[0].before.selling_price, "10.00");
  assert.equal(events[0].after.selling_price, "12.00");
});

test("audit list denies employees, role changes and guests before any database queries", async () => {
  const { listAuditLogs } = loadTs("src/services/audit.service.ts", { "@/lib/prisma": { prisma: { async $transaction() { assert.fail("Unauthorized audit lookup"); } } } });
  for (const role of ["SALES", "INVENTORY", "FINANCE", "GUEST", "UNKNOWN"]) {
    await assert.rejects(listAuditLogs({ ...admin, role }, { role: "ADMIN", actorId: "1" }), error => error.status === 403);
  }
  const { canAccess } = loadTs("src/lib/access.ts");
  assert.equal(canAccess("GUEST", "audit"), false);
  assert.equal(canAccess("ADMIN", "audit"), true);
});

test("audit query validates dates, IDs and pagination and uses inclusive Manila calendar dates", async () => {
  const { auditFilterSchema } = loadTs("src/validations/audit.schema.ts");
  for (const input of [{ actorId: "9223372036854775808" }, { actorId: "0" }, { from: "2026-02-30" }, { from: "2026-10-22", to: "2026-10-21" }, { page: "-1" }, { page: ["1", "2"] }]) assert.equal(auditFilterSchema.safeParse(input).success, false);
  const calls = [];
  const tx = { audit_logs: {
    async count(query) { calls.push(query); return 26; },
    async findMany(query) { calls.push(query); return [{ id: 1n, actor_id: 2n, entity_id: 3n, created_at: new Date("2026-10-21T00:00:00Z") }]; },
  } };
  const { listAuditLogs } = loadTs("src/services/audit.service.ts", { "@/lib/prisma": { prisma: { async $transaction(operation, options) { assert.equal(options.isolationLevel, "RepeatableRead"); return operation(tx); } } } });
  const result = await listAuditLogs(admin, { actorId: "2", entity: "ORDER", outcome: "SUCCESS", action: "ORDER_COMPLETED", from: "2026-10-21", to: "2026-10-21", page: "999" });
  assert.equal(calls[0].where.actor_id, 2n);
  assert.equal(calls[0].where.action, "ORDER_COMPLETED");
  assert.equal(calls[0].where.created_at.gte.toISOString(), "2026-10-20T16:00:00.000Z");
  assert.equal(calls[0].where.created_at.lt.toISOString(), "2026-10-21T16:00:00.000Z");
  assert.equal(calls[1].skip, 25); assert.equal(calls[1].take, 25);
  assert.equal(result.page, 2); assert.equal(result.rows[0].id, "1");
  assert.equal(result.rows[0].entity_id, "3");
});

test("audit endpoint rejects unauthenticated and non-admin identities including tampered role filters", async () => {
  let identity = null;
  const denied = [];
  const route = loadTs("src/app/api/audit/route.ts", {
    "next/headers": { async cookies() { return { get() { return { value: "a".repeat(43) }; } }; } },
    "next/navigation": { redirect() { throw new Error("Redirect"); } },
    "@/lib/session-store": { async readSession() { return identity; } },
    "@/server/audit": { async recordSecurityEvent(actor, event) { denied.push({ actor, event }); } },
    "@/lib/rate-limit": { async limitRequest() {}, RateLimitError: class extends Error {} },
    "@/services/audit.service": { async listAuditLogs() { assert.fail("Unauthorized query"); } },
  });
  for (const role of [null, "SALES", "INVENTORY", "FINANCE", "GUEST"]) {
    identity = role ? { ...admin, role } : null;
    const response = await route.GET(new Request("https://example.com/api/audit?role=ADMIN&actorId=1"));
    assert.equal(response.status, role ? 403 : 401);
  }
  assert.equal(denied.length, 3);
  assert.equal(denied[0].event.action, "ACCESS_DENIED");
  assert.equal(denied[0].event.outcome, "DENIED");
});

test("login failures do not attribute an unauthenticated attempt to the targeted account", async () => {
  const events = [];
  const route = loadTs("src/app/api/auth/login/route.ts", {
    "@/lib/auth": { async createSession() { assert.fail("Bad password must not create a session"); } },
    "@/lib/prisma": { prisma: { users: { async findFirst() { return { ...admin, password_hash: "hash" }; } } } },
    "@/lib/password": { async verifyPassword() { return false; } },
    "@/server/audit": { async recordSecurityEvent(actor, event) { events.push({ actor, event }); } },
    "@/lib/rate-limit": { async limitRequest() {}, async consumeLimit() {}, RateLimitError: class extends Error {} },
  });
  const response = await route.POST(new Request("https://example.com/api/auth/login", { method: "POST", headers: { Origin: "https://example.com" }, body: JSON.stringify({ email: "admin@example.com", password: "bad password" }) }));
  assert.equal(response.status, 401);
  assert.equal(events[0].actor, null);
  assert.equal(events[0].event.entityId, admin.id);
  assert.equal(events[0].event.action, "LOGIN_FAILED");
  assert.doesNotMatch(JSON.stringify(events, (_, value) => typeof value === "bigint" ? value.toString() : value), /bad password|admin@example.com|password_hash/);
});

test("session lifecycle records logins, cap revocation and one explicit logout without storing tokens", async () => {
  const { store, audit } = sessionHarness({ ...admin, password_hash: "secret-hash" });
  let token;
  for (let i = 0; i < 4; i++) token = await store.issueSession(admin.id, "secret-hash");
  assert.equal(audit.filter(row => row.action === "LOGIN_SUCCEEDED").length, 4);
  assert.equal(audit.filter(row => row.action === "SESSION_REVOKED").length, 1);
  await store.revokeSession(token);
  await store.revokeSession(token);
  assert.equal(audit.filter(row => row.action === "LOGOUT").length, 1);
  assert.doesNotMatch(JSON.stringify(audit, (_, value) => typeof value === "bigint" ? value.toString() : value), /secret-hash|token_hash|password_fingerprint/);
});

test("admin audit view has accessible filters, escaped details, pagination and an empty state", async () => {
  const data = { total: 26, page: 1, pages: 2, rows: [{ id: "1", actor_name: "<script>Admin</script>", actor_role: "ADMIN", actor_id: "1", action: "PRODUCT_UPDATED", entity_type: "PRODUCT", entity_id: "2", outcome: "SUCCESS", before: { selling_price: "10.00" }, after: { selling_price: "12.00" }, created_at: "2026-10-21T00:00:00Z" }] };
  const NativePage = loadTs("src/app/(erp)/settings/audit/page.tsx", {
    "@/lib/auth": { async requirePageAccess(module) { assert.equal(module, "audit"); return admin; } },
    "@/services/audit.service": { async listAuditLogs() { return data; } },
    "next/link": { __esModule: true, default: ({ children, ...props }) => createElement("a", props, children) },
  }).default;
  let html = renderToStaticMarkup(await NativePage({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Audit log pagination/); assert.match(html, /View changes/);
  assert.match(html, /&lt;script&gt;Admin&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>Admin/);
  assert.match(html, /name="from"/); assert.match(html, /name="actorId"/);
  data.rows = []; data.total = 0; data.pages = 1;
  html = renderToStaticMarkup(await NativePage({ searchParams: Promise.resolve({}) }));
  assert.match(html, /No audit events match these filters/);
});
