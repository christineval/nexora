# Deployment security review — 2026-10-15

## Implemented

- Registered user sessions use random 256-bit opaque tokens; PostgreSQL stores SHA-256 digests only. Each session expires one hour after issuance regardless of activity. Logout revokes the stored token, and password changes invalidate existing sessions through password fingerprints. Roles are read from the database on each authenticated request.
- Login locks the user row while pruning sessions and creating a replacement. A fourth login evicts the oldest active session; concurrent logins use the same lock. Guest cookies also have an absolute one-hour lifetime. Guests have no persisted user identity, so the per-user three-session limit applies to registered users.
- Every implemented API handler passes through the shared request guard. PostgreSQL atomic counters allow 120 API requests/minute and 30 authentication requests/minute per trusted client IP. Login and password changes also allow five attempts per account per 15 minutes, including successful attempts. Rejections return HTTP 429 with Retry-After. Limits fail closed if the database is unavailable.
- Mutation requests must have the same origin. JSON bodies are limited to 64 KiB while streaming, including requests with missing or dishonest Content-Length.
- Query inspection found Prisma relation includes/selects for list reads and a single batched product lookup when preparing an order. No classic per-row read-query loop or unsafe raw SQL calls were found. Parameterized tagged SQL is used for counters, user locks and SKU generation. This is code inspection, not a database query trace or penetration test.
- Product detail lookup now queries its ID directly. Transaction preparation uses a product map. SKU generation preserves sequence values beyond 9999 instead of truncating them to four digits.
- Stock completion retains sorted, conditional per-product writes inside a transaction. These writes protect concurrency and preserve inventory audit records; they are not read-query N+1 behavior.

## Deployment requirements

Login troubleshooting (2026-10-16): a read-only check found that the connected database has neither security table nor Prisma migration history. A read-only Prisma schema diff proposed only the two security tables and their indexes/foreign key. Both admin and guest login fail at the shared rate-limit guard before sign-in; admin sessions also need the session table. The API now returns a safe setup-specific HTTP 503 instead of a generic HTTP 500 for missing tables. No protection is bypassed. Verification: 85 tests, TypeScript and targeted ESLint passed; successful runtime sign-in remains unverified until the migration is applied. The pending session foreign key was aligned with Prisma's `ON UPDATE CASCADE` rule before application.

For this existing matching database, the reviewed migration sequence is to mark `0_init` applied, then deploy the additive security migration. These commands have **not** been executed; repository instructions require an explicit migration request. Marking the baseline records migration history and does not recreate business tables:

```powershell
npm.cmd exec prisma -- migrate resolve --applied 0_init
npm.cmd exec prisma -- migrate deploy
```

Review/backup the target database first and verify that no additional pending migrations have been introduced before deployment.

1. Back up the database and review `prisma/migrations/20261015000000_session_security/migration.sql`. Apply the migration through the established deployment workflow before running this version. The migration has **not** been applied by this review. Generate the Prisma client during the build.
2. All previous registered-user cookies and older guest cookies become invalid. Users must sign in again.
3. Configure `TRUSTED_CLIENT_IP_HEADER` only if the ingress overwrites that header with one validated client IP and direct backend access is blocked. Never trust arbitrary forwarded headers. If unset/invalid, callers share the same conservative fallback buckets, which can throttle unrelated users. Account limits still apply independently.
4. Keep the app behind a reverse proxy with connection, body-size and edge abuse limits. Application counters do not protect against network saturation or unlimited database-bound requests.
5. Schedule periodic deletion of expired rows from `api_rate_limits` and `user_sessions`, using their `expires_at` indexes. Session creation also prunes expired sessions for that user. Expired rows are invalid even before cleanup. Review retention/cleanup frequency against traffic volume.
6. Exercise login, fourth-session eviction, logout replay, password changes and simultaneous sales/purchase operations against an isolated migrated staging database. Unit tests model database behavior; they do not prove real PostgreSQL locking/rollback behavior.

## Remaining findings

Order ownership hardening: non-admin users now receive only orders they created, subject to module permissions; admins can access all orders. Order services apply ownership in database reads and transactional update predicates, including legacy readers, histories, order reports and dashboard totals. Inaccessible IDs return 404. Creation uses the authenticated actor and edits cannot transfer ownership. Shared catalogs and independent audit datasets retain their module access rules. Guest data remains synthetic. The ownership regression tests include swapped IDs, forged body identity fields, owner/admin successes and dashboard scoping. The full unit suite now has 84 passing tests; database workflow assertions were updated for staging but were not executed against the connected business database.

- List screens, reports and some detail/history pages still load whole datasets before client-side filtering/pagination. Relation reads are batched, but response sizes and memory use grow with business history. Server-side pagination and filtered detail/report queries should precede large-data use; silently truncating financial reports would be incorrect.
- Authentication/session checks can repeat between a layout and page. Request-scoped caching could reduce those reads but was not introduced because it changes authorization freshness semantics.
- The SKU sequence is referenced by existing application code but is absent from the baseline migration. A read-only metadata check confirmed `public.product_sku_seq` exists in the connected database; its current value was not checked or changed. Confirm correct positioning in staging before deployment.
- The existing case-sensitive unique email index and case-insensitive login lookup can disagree if legacy accounts differ only by email case. Audit existing accounts before considering a case-insensitive uniqueness migration.
- This review does not establish deployment-wide readiness, third-party dependency safety, or verified production database constraints. No business database migrations or destructive database tests were run.

## Verification

- `npm.cmd test`: 72 tests passed, including session expiry/revocation, the three-session cap, limiter thresholds, trusted-header handling, oversized JSON and API guard coverage. Concurrency tests use a serialized in-memory model; real database races remain a staging check.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run prisma:validate`, and `npm.cmd run build`: passed. Prisma client generation also passed.
- Read-only database metadata confirmed users and the SKU sequence exist; the new security tables do not yet exist.
- Build warning: React 18 support is deprecated in Next.js 16. Existing tests also emit module-type warnings. Neither failed verification.
- PowerShell blocked the initial `npm` command through its script execution policy; `npm.cmd` completed the checks successfully. No execution policy was changed.

References: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Next.js self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting).
