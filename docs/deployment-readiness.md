# Deployment readiness — 2026-10-16

Verdict: the application builds successfully, but it is not ready for public production deployment in the inspected state. Prepare a separate hosted staging environment first. No database migrations or public deployment were performed during this check.

## Checks performed

| Check | Result |
| --- | --- |
| Unit/regression suite | 85 passed |
| ESLint | Passed |
| Production build, including TypeScript | Passed on Node 24.13.1 |
| Production dependency audit | npm reported 0 known vulnerabilities with `--omit=dev`; the first sandboxed attempt failed to reach the registry, and the approved network retry passed |
| Prisma migration status | Failed readiness check: `20261015000000_session_security` is pending; `0_init` is already recorded |
| Read-only database metadata | `user_sessions` and `api_rate_limits` absent; SKU sequence present |
| Private configuration checks | Database points to localhost; guest signing secret is configured; trusted client IP header is unset. No secret values were printed |
| Local production HTTP smoke check | Login page and OCR worker URLs return 200; both login endpoints return setup-specific 503 using `localhost` |
| Cross-origin request | Rejected with 403 |
| Host alias | Requests using `127.0.0.1` as Origin returned 403 while `localhost` reached the database guard. Verify same-origin behavior on the exact hosted HTTPS domain |
| Tracked sensitive files | No `.env` files other than `.env.example`, backups, or dump files found in Git's current tracked-file inventory; Git history was not audited |
| Release completeness | Required security code and its migration are currently untracked; commit the complete intended release before Git-based deployment |

Build warnings: Next.js warns about React 18 deprecation; some tests emit module-type warnings. These did not fail the checks.

## Items to complete

1. Apply the pending security migration to the database used by the application. The current login failures occur before credential verification. The local baseline is now recorded, so do not repeat baseline resolution on this database.
2. Provision hosted PostgreSQL. `localhost` on a hosting platform is not the PostgreSQL instance on your computer. Keep preview/staging data separate from production.
3. Commit all required source files, migrations, lockfile, and `scripts/prepare-ocr-assets.mjs`; keep `.env`, private backups, `node_modules`, and `.next` excluded. Review `git status` instead of blindly staging unrelated working changes.
4. Configure the host's trusted IP header. Without it, all callers share the fallback limits of 30 auth requests/minute and 120 other API requests/minute. On direct Vercel deployments, its documented `x-real-ip` header fits the current single-IP validator. Other ingress setups need their own verified, overwritten header.
5. Test actual admin and guest login, secure cookies, logout, fourth-session eviction, password changes and ownership restrictions through the hosted HTTPS URL. Runtime admin login was not tested because no password was requested. Real PostgreSQL session locking and ERP rollback/concurrency remain staging checks.
6. Schedule expired session/rate-limit row cleanup and enable database backups and application error monitoring. Expiry checks already reject expired sessions even before rows are cleaned up.

The `test:guest` browser configuration deliberately points to an unreachable database, and its test still expects guest login and API reads to work. That expectation predates the database-backed API limiter. It needs revision to cover the current contract; it was inspected, not run. Guest demo data selectors remain independent of business database reads, while every API request requires the limiter database.

List screens and several detail/report queries still load full datasets. This is a scaling limitation despite batched relation queries. Do not treat the successful build as load testing or evidence that large business datasets have been verified.

## Selected hosting path: Vercel + Supabase

Supabase is the selected PostgreSQL provider; Vercel can host the existing full-stack Next.js application. Follow [the Supabase-specific deployment guide](supabase-deployment.md) for connection modes, Data API protection, fresh setup and safe record transfer. Pricing and account limits must be checked before provisioning.

### 1. Complete the local migration

Stop the development server, confirm the configured target privately, then run commands one at a time:

```powershell
npm.cmd run db:backup
npm.cmd exec prisma -- migrate deploy
npm.cmd exec prisma -- migrate status
npm.cmd run prisma:generate
```

Stop on any failure. Expect migration status to report that the database is up to date. Test local login afterward. `migrate deploy` applies pending migrations; it does not reset existing business records.

### 2. Prepare hosted PostgreSQL

Choose one path using a separate operator checkout/environment, so your original local connection remains intact:

- **Fresh empty hosted database:** configure its direct PostgreSQL connection privately as `DATABASE_URL`, run `npm.cmd exec prisma -- migrate deploy`, then run `npm.cmd run admin:create` interactively to create its first admin.
- **Keep current records:** back up the source and follow the reviewed ERP-only transfer branch in [the Supabase guide](supabase-deployment.md). Supabase already has platform-owned schemas; do not blindly restore a full database over them. Inspect imported migration history before baselining or deploying pending migrations.

Use Supabase's direct connection for migration operations, or its session pooler on port 5432 when IPv6 is unavailable. For a serverless runtime, use its Prisma-compatible pooled connection and verify connection limits in staging. This repository currently reads only `DATABASE_URL` in its Prisma datasource, so merely setting a separate unpooled variable does not change CLI behavior: supply the direct connection as `DATABASE_URL` in the separate operator environment when running migrations. Keep the app's runtime URL configured separately.

### 3. Import the committed repository into Vercel

Select Next.js as the framework and the Nexora directory as the project root. Use Node 24.x to match the locally tested major version. Use these commands:

| Setting | Value |
| --- | --- |
| Install | `npm ci` |
| Build | `npm run build` |
| Output directory | Framework default |

The install's `postinstall` prepares local OCR assets under ignored `public/ocr`. Build generates the Prisma client. Keep install scripts enabled; if disabled deliberately, run `npm run ocr:prepare` before building. Do not configure static export: this application needs Next.js server execution.

Set private environment variables for the intended environment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Hosted PostgreSQL runtime connection, with provider-required TLS options |
| `SESSION_SECRET` | A new random secret of at least 32 characters, stable across instances of that environment |
| `TRUSTED_CLIENT_IP_HEADER` | `x-real-ip` for a direct Vercel deployment; verify the ingress when using additional proxies |

Do not add `NEXT_PUBLIC_` to these variables. Generate a secret privately in your own terminal if needed:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store it in the hosting environment settings, not a committed source file. Use separate database credentials and signing secrets for preview and production. Choose a function region close to the database. Apply reviewed migrations as an explicit release step, not independently in every parallel preview build.

### 4. Verify the hosted staging URL before promoting

- Open the exact HTTPS domain; verify admin and guest login and logout without 403, 500 or 503 responses.
- Verify cookies are HttpOnly, Secure and SameSite=Lax; verify one-hour expiry and the three-session cap.
- Use two staff accounts to verify lists, direct URLs, histories, reports and mutation requests cannot access another creator's orders; verify admin access still works.
- On staging data, complete a sale and receive a purchase, check stock/audit/ledger consistency, then exercise duplicate completion, insufficient stock and concurrent requests. Do not run destructive database tests against important data.
- Check `/ocr/worker.min.js`, `/ocr/pdf.worker.min.mjs`, OCR core/language files and a representative browser receipt import.
- Verify restore recovery, monitoring and rate-limit behavior before accepting real business traffic.

## References checked

- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel trusted request headers](https://vercel.com/docs/headers/request-headers)
- [Supabase Prisma integration](https://supabase.com/docs/guides/database/prisma)
- [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)

Files for this review: added `docs/deployment-readiness.md`; edited no existing files; deleted none. No business records, migration history, or hosting settings were changed.
