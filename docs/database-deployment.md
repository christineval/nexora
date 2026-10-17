# Preparing Nexora's hosted database

The existing local database is PostgreSQL 18.6. `prisma/migrations/0_init/migration.sql` was exported from its actual public schema, rather than reconstructed from Prisma. It preserves all ten business tables, 23 check constraints, primary/foreign keys, unique constraints, indexes, ten ID sequences, and `product_sku_seq`. It contains no accounts or business records.

Supabase is the selected hosted database provider. Follow [the Supabase deployment guide](supabase-deployment.md); its platform-managed schemas require a reviewed ERP-only transfer rather than a blind full-database restore. The local readiness check on 2026-10-16 found `0_init` recorded and the security migration pending. Inspect each target independently before baselining. Creating migration files and exporting backups does not apply them.

## 1. Back up the source database

From the project directory, with the existing local `DATABASE_URL` configured:

```powershell
npm.cmd run db:backup
```

The script uses PostgreSQL's `pg_dump` to create a custom-format archive under ignored `backups/`. On Windows it detects the installed PostgreSQL tools. Elsewhere put `pg_dump` on PATH; alternatively set `PG_DUMP_PATH` to the executable. Use a pg_dump version compatible with the source server. Passwords are passed through the child process environment, not command arguments or console output.

These archives contain private records and password hashes. Keep them out of Git and store a protected copy outside this computer. Verify a backup by restoring it to a separate disposable database before relying on it. Listing its archive contents only verifies readability, not successful restoration.

## 2. Create the hosted PostgreSQL database

Create a separate database with your chosen provider. PostgreSQL 18 matches the source database version. If choosing an older supported server version, test the baseline and any backup restore against that version first; pg_dump does not guarantee exports will load into an older PostgreSQL version.

Choose one workflow below. Use a direct database connection for migrations and restoration unless your provider explicitly supports its pooler for those operations. The account must be allowed to create tables, sequences, and indexes in `public`.

## 3A. Start with an empty hosted database

Use a separate checkout or operator environment so your original local `.env` remains intact. Configure its private `DATABASE_URL` to the new empty hosted database. Do not paste credentials into source files or commit them.

Install dependencies and generate Prisma, then check migration status:

```powershell
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd exec prisma -- migrate status
```

An unapplied `0_init` is expected. Confirm independently that this is the intended empty database before running:

```powershell
npm.cmd exec prisma -- migrate deploy
npm.cmd exec prisma -- migrate status
npm.cmd run admin:create
```

`migrate deploy` creates the schema and records migration history. It does not import sample records. Create your administrator interactively; then add products, contacts and suppliers through the app. Configure the hosting application's `DATABASE_URL` for this same database and its own private `SESSION_SECRET`.

## 3B. Transfer existing records

If you need the current records, restore the private custom-format backup into the new empty hosted database using PostgreSQL `pg_restore`. Use `--no-owner`, `--no-privileges`, `--exit-on-error`, and `--single-transaction`; the restore connection must target the hosted database. Use protected PostgreSQL connection configuration or provider tools, rather than a password in command arguments.

Do not run `migrate deploy` first: the full backup already contains the schema. After restoration, verify that the restored schema matches `0_init`, including its constraints and sequences. Then configure Prisma to that hosted database and record the existing schema:

```powershell
npm.cmd exec prisma -- migrate resolve --applied 0_init
npm.cmd exec prisma -- migrate status
```

The backup includes sequence state, which matters when records already have IDs/SKUs. Never restart the SKU sequence at 1 after a data transfer. Existing users and password hashes are also transferred; review which accounts should have access before publishing.

## Alternative provider: Neon restore instructions (not the selected Supabase workflow)

Create an empty Neon database on PostgreSQL 18, matching the local major version. In **Connect**, choose that database and role, and disable connection pooling. Use the direct hostname, without `-pooler`. Do not run `migrate deploy` before a full restore.

Stop making business changes locally during the final transfer. With the original local `.env` still configured, refresh the backup:

```powershell
npm.cmd run db:backup
```

Replace the placeholders below with the direct host, role and database from Neon. These arguments contain no password; `--password` prompts for it privately. These commands write to the named Neon database, so verify its identity and that it has no business tables before executing them.

```powershell
$backup = Get-ChildItem -LiteralPath backups -Filter '*.dump' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $backup) { throw 'No backup found. Run db:backup first.' }
$env:PGSSLMODE = 'require'
$env:PGCHANNELBINDING = 'require'
& 'C:/Program Files/PostgreSQL/18/bin/pg_restore.exe' `
  --host='YOUR_DIRECT_NEON_HOST' `
  --port=5432 `
  --username='YOUR_NEON_ROLE' `
  --dbname='YOUR_NEON_DATABASE' `
  --password --no-owner --no-privileges `
  --exit-on-error --single-transaction `
  $backup.FullName
if ($LASTEXITCODE -ne 0) { throw 'Restore failed. Do not proceed to migration baselining.' }
```

Compare source and target record counts, constraints and sequence state, including `product_sku_seq`. The inspected full archive includes all ten tables' data and all eleven sequences' saved values. Existing account credentials transfer with their hashes.

Next, in a separate checkout/operator environment whose private `DATABASE_URL` points to this restored Neon database, run:

```powershell
npm.cmd exec prisma -- migrate resolve --applied 0_init
npm.cmd exec prisma -- migrate status
```

This records the existing schema rather than creating tables a second time. Keep the original local `.env` intact. Only switch the hosted application to Neon after verification, and avoid further writes to the old database after cutover.

Neon reference: [Migrate with pg_dump and pg_restore](https://neon.com/docs/import/migrate-from-postgres).

## 4. Adopt migration history on the original local database

The original local schema already exists. After checking that it still matches the baseline, take a backup and use its local connection to run:

```powershell
npm.cmd exec prisma -- migrate resolve --applied 0_init
npm.cmd exec prisma -- migrate status
```

`resolve --applied` records migration history without replaying CREATE TABLE commands. It changes Prisma's migration metadata. Do not run the baseline's CREATE statements against existing business tables. Once adopted, preserve the baseline and add separate migrations for future approved schema changes.

## 5. Verify the deployment

Confirm all ten tables and `product_sku_seq` exist. Test login and role restrictions. In a separate preview database, test product creation, a complete sale, a received purchase, stock adjustments, and their inventory/ledger effects. Verify backup restoration and configure your provider's automated backups before accepting real business data.

References: [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [Prisma baselining](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining). Prisma documentation may show newer CLI versions; the commands above were checked against this project's Prisma 5 CLI.
