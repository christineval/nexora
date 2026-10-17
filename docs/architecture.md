# Nexora architecture

Nexora is a single full-stack Next.js application using the existing PostgreSQL schema.

```text
Next.js page / browser form
  -> authentication and module authorization
  -> validated API boundary
  -> server-only business service
  -> Prisma transaction
  -> PostgreSQL
  -> inventory, CRM, finance, and derived reports
```

## Responsibilities

- `src/app/(erp)`: server-rendered route composition, permission checks, loading/error states. The dashboard UI and reporting implementation are preserved.
- `src/app/api`: thin authenticated, authorized HTTP boundaries. Mutation requests check their origin and validate inputs with Zod. Expected business errors are mapped to safe responses.
- `src/services`: server-only queries and use cases. Existing service locations are retained rather than introducing a second architecture.
- `src/services/transaction.service.ts`: shared sales/purchasing pricing preparation, pending-item editing, and status transitions. Serializability plus conditional stock/status updates prevent partial and repeated effects.
- `src/services/contact.service.ts`: shared customer/supplier reads and validated writes.
- `src/services/adjustment.service.ts`: atomic stock changes and inventory audit records.
- `src/services/user.service.ts`: safe user DTOs, password hashing, and administrator-access protection.
- `src/components/features`: shared customer/supplier managers, order/purchase managers and forms, ledger view, reports, user administration, and settings.
- `src/components/ui`: shared feature table with search, exact status/type filters, Philippine date filters, sorting, pagination and CSV export; headings, details, badges, errors, dialogs, and duplicate-submission protection.
- `src/components/inventory`: preserved Products pattern, working product editor, adjustment dialog, and movement history.
- `src/lib`: Prisma singleton, registered and guest sessions, module access rules, safe API errors, presentation helpers, and decimal-safe report sums.
- `src/validations`: schema-aligned trust-boundary validation for IDs, contacts, money, product data, transaction lines, adjustments, and users.
- `src/types/features.ts`: serialized feature DTOs; IDs and Decimal values are strings and dates are ISO strings.
- `prisma`: the introspected ten-table database schema and intentionally empty seed.
- `tests`: unit tests, rollback-only PostgreSQL checks, and browser tests.

## Database and workflow invariants

The database's existing primary keys, foreign keys, and check constraints are preserved. Prisma does not fully represent the PostgreSQL check constraints. In particular, every inventory movement stores a **positive quantity**, including SALE and ADJUSTMENT_OUT. UI signs are derived from the movement type.

Orders and purchases are headers with related product lines. New totals use Prisma Decimal arithmetic and authoritative current product prices. Pending edits replace only the unposted product lines in one transaction. Final orders, inventory audit records, and ledger entries are never deleted through the UI.

Completing a confirmed sale or receiving an ordered purchase guards the source status, changes stock with conditional updates, inserts inventory movements, and posts equal debit/credit amounts atomically. Stock locks are acquired in product-ID order. A failure or serialization conflict rolls back the full workflow. No automatic stock change happens when creating a pending transaction.

Approved accounting rules and role access are documented in the [README](../README.md). Reports derive from completed orders, received purchases, current products, and ledger records; no report summary tables are persisted. Historical report amounts come from saved transaction items, not current prices.

## Authentication and client boundary

The existing bcrypt hashes are verified with bcryptjs. Registered users receive a random opaque HTTP-only cookie; its SHA-256 digest, user reference, one-hour expiry and password fingerprint are stored in PostgreSQL. Logins lock the user row to enforce three active sessions, evicting the oldest on a fourth login. Logout revokes the stored session. Guest cookies remain HMAC-signed with a one-hour absolute expiry. Authorization loads the current database role and returns only the user's ID, name, and role. Session secrets and hashes remain server-only. Password changes rotate the fingerprint and invalidate other sessions. API requests use shared atomic PostgreSQL rate counters, including guest API requests; configure a trusted proxy IP header for per-client limits.

Layout authentication is paired with per-module page checks and API permission checks. Navigation reflects the same module access map, including read-only inventory for SALES. Browser-supplied roles and creator IDs are not accepted.

Components never import the Prisma singleton. Server Components call services directly instead of fetching the app's own API. Client forms use shared mutation handling and refresh server-rendered records only after a successful response. Finalization and cancellation require an explicit confirmation dialog.

Aliases `/inventory`, `/finance`, and `/reports` redirect to their primary list pages. Existing new/detail routes remain available. The homepage redirects to the dashboard.

## Operational limits

The current list pattern loads data per page and performs filters/pagination in the browser. Larger datasets need server-side pagination. Login throttling is per process; multiple instances need a shared limiter. Inventory value uses current unit cost and does not implement FIFO, weighted-average costing, COGS, payments, returns, or tax automation.

No migrations, database resets, or destructive audit operations are part of this implementation.



Sales and purchase order access is restricted to the authenticated creator for non-admin users; admins can access all orders. Module permissions still apply. The database query scope is shared by order lists, details, customer/supplier order histories, order reports and dashboard totals. Edits and status changes enforce ownership inside the transaction and retain creator predicates on updates. Inaccessible IDs return not found. Finance report access also remains creator-scoped; a finance user with no orders sees empty order reports. Guest order records remain synthetic demo data. Shared product, customer, supplier, stock-audit and ledger datasets retain their existing module permissions.
