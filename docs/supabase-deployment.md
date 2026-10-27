# Deploy Nexora with Supabase PostgreSQL

Use Supabase for PostgreSQL and a Next.js host such as Vercel for the application. Nexora keeps its existing Prisma queries, bcrypt passwords, session registry and server-side role/ownership checks. This setup does not switch the app to Supabase Auth or browser database access.

## 1. Create and secure the Supabase project

Create a separate project for staging. Select a region close to your application host and retain the database password privately. Check the project's actual PostgreSQL version before transferring data: the inspected local database is PostgreSQL 18.6, and importing into an older major version requires compatibility testing.

Turn off the Supabase Data API in API settings when using this Prisma-only architecture, as recommended by Supabase's Prisma guide. Nexora's migrations do not define Supabase RLS policies, and the application's session/ownership checks do not protect a separate Data API route. Do not expose the ERP tables through that alternate route.

No Supabase publishable/anon key, service-role key, or browser SDK is needed for this database-only setup. Keep PostgreSQL credentials server-only.

## 2. Get the correct connection strings

Use the project's **Connect** dialog and copy the actual host and username; do not derive the pooler hostname from the region.

| Purpose | Connection |
| --- | --- |
| Prisma migrations and admin setup | Direct PostgreSQL connection, or the session pooler on port 5432 when direct IPv6 connectivity is unavailable |
| Next.js serverless runtime | Transaction pooler on port 6543 with Prisma's `pgbouncer=true` option |

For the serverless runtime, include `sslmode=require` and start with `connection_limit=1`, then measure before increasing it. Add options with `&` when the copied URL already contains `?`. URL-encode special characters in the password.

Nexora uses Prisma 5.22.0 and currently reads **only `DATABASE_URL`** from `schema.prisma`. Setting `DIRECT_URL` alone will not change the CLI connection. Use a separate operator checkout/environment with `DATABASE_URL` set to the migration connection, and configure the application host's `DATABASE_URL` separately with its runtime connection. No Prisma upgrade or adapter installation is necessary for these instructions.

## 3. Choose fresh data or existing records

### Start with no Nexora records

Use a new Supabase project with no Nexora business tables. Its managed schemas such as `auth` and `storage` are not Nexora tables and must be preserved. In your separate operator environment, privately configure the migration connection as `DATABASE_URL`, confirm the target, and run commands individually:

```powershell
npm.cmd ci
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd exec prisma -- migrate deploy
npm.cmd exec prisma -- migrate status
npm.cmd run admin:create
```

Stop if a command fails. `migrate deploy` should apply both `0_init` and the session-security migration to the fresh Nexora schema. The interactive admin command creates an account in `public.users`, not Supabase Auth. Do not mark `0_init` applied on a fresh Nexora schema: it must actually create the business tables.

If Prisma reports an existing nonempty schema, inspect the conflicting objects instead of baselining an unverified target or dropping Supabase-managed objects.

### Keep existing Nexora records

Back up the source using `npm.cmd run db:backup` before changing any connection settings. Keep the original local connection intact in its own checkout/environment.

Use a reviewed ERP-only transfer into Supabase, preserving constraints, order ownership, password hashes and sequence values. Do not blindly restore a whole database over Supabase's existing schemas. A new Supabase project already has platform-owned schemas and a `public` schema; generic full-database restore instructions may conflict with them. Do not use `--clean` against the project.

After the reviewed restore/import, inspect schema and migration history before deciding whether baseline resolution is needed. If the imported archive already includes an applied `0_init`, do not repeat `migrate resolve`. Apply only pending migrations. If there is no migration history, baseline only after verifying that the actual ERP schema matches it. The prior local readiness check found the baseline recorded but the security migration pending; that snapshot does not establish the state of a new Supabase target.

Test the transfer in staging before moving important records. A successful backup export is not proof of successful restoration, particularly across PostgreSQL major versions.

## 4. Configure the Next.js application host

For Vercel, import the complete committed repository with the Next.js preset, Node 24.x, install command `npm ci`, build command `npm run build`, and the default output directory. The existing install script prepares OCR assets and the build generates Prisma Client.

Configure private environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction-pooler URL with `pgbouncer=true`, TLS and connection-limit options described above |
| `SESSION_SECRET` | New random secret of at least 32 characters, stable across instances of this environment |
| `TRUSTED_CLIENT_IP_HEADER` | `x-real-ip` on direct Vercel hosting; otherwise use a verified header overwritten by your actual ingress |

Do not prefix these with `NEXT_PUBLIC_`. Keep staging and production databases/secrets separate. Apply migrations using the operator connection before releasing the application that needs them, rather than running migrations independently in every preview build.

## 5. Verify before publishing

Use the exact hosted HTTPS URL to verify admin/guest login, logout, one-hour expiry, fourth-session eviction and non-admin creator-only order access. Check that server-rendered pages and mutation requests accept the correct origin and reject a different origin.

On staging data, verify sale completion, purchase receipt, audit/ledger consistency, insufficient-stock rollback and concurrent operations. Verify OCR assets/imports, backup recovery, connection-pool capacity, monitoring and expired security-row cleanup. Confirm the Data API is disabled for this Prisma-only project.

The previous build and unit-test results do not verify your Supabase instance. No Supabase connection, migration, account creation or deployment was performed while writing this guide.

Sources: [Supabase Prisma integration](https://supabase.com/docs/guides/database/prisma), [Supabase connection modes and Prisma pooler options](https://supabase.com/docs/guides/database/connecting-to-postgres), [Vercel request headers](https://vercel.com/docs/headers/request-headers).
