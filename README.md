# Nexora

A centralized business operations application built with Next.js App Router, React, TypeScript, Tailwind, MUI Data Grid, PostgreSQL, Prisma, and Zod. Business services connect CRM, sales, purchasing, inventory, and finance in one application.

## Local setup

Use the existing PostgreSQL database represented by `prisma/schema.prisma`. Copy `.env.example` to `.env` only for a new checkout and set `DATABASE_URL`.

```sh
npm install
npm run prisma:generate
npm run auth:configure
npm run dev
```

`auth:configure` generates a random local `SESSION_SECRET` if missing, without changing existing environment values. Sign in using an existing database user's email and password. No accounts or passwords are seeded. Existing bcrypt password hashes are supported. Production requires HTTPS and a private, stable `SESSION_SECRET` of at least 32 characters.

If you do not know the sample accounts' passwords, create your own administrator from the project terminal:

```sh
npm run admin:create
```

Enter your name, a new email, and a password of at least 12 characters (maximum 72 UTF-8 bytes). Password entry is hidden. The command creates an `ADMIN` user with a bcrypt hash and refuses to overwrite an existing email, including case variants. Sign in at `/login` with those credentials. Once signed in, use **Administration → Users → Add User** to create additional accounts. No sample data is deleted. The command is intended for a trusted operator with access to the configured database.

On Windows PowerShell systems that block npm.ps1, use `npm.cmd` instead of `npm`.

The database was introspected from ten existing tables. The `0_init` migration now captures the existing schema, including PostgreSQL check constraints and the SKU sequence. It has not been applied to the local database. Existing databases must be reviewed and baselined with `migrate resolve --applied 0_init`; new empty databases use `migrate deploy`. See [database deployment](docs/database-deployment.md) for backup, fresh deployment, and data-transfer instructions. Do not reset existing databases.

## Feature workflows

- Products: search, status/stock filters, sorting, pagination, creation, editing, details, and stock history. New products start with zero stock; the existing database sequence assigns their SKU.
- Customers and suppliers: searchable records, status filters, creation/editing modals, details, and related transaction history. Inactivation retains business records.
- Sales: one row per order header, item details, pending-order creation/editing, confirmation, completion, and cancellation.
- Purchasing: pending purchase creation/editing, ordering, receiving, cancellation, and item details.
- Inventory movements: product/type/date filters, details, and authorized adjustments. Stored quantities are positive magnitudes; the movement type determines the signed change displayed.
- Finance: ledger search, account/type/date filters, filtered debit/credit summaries, details, and CSV export. Existing audit entries remain read-only.
- Reports: completed sales, received purchases, date filters, trends, top products, details, and CSV exports. Inventory reports show current stock and cost valuation.
- Administration: create users with bcrypt-hashed passwords, edit names/emails/roles, change your password, and select a browser theme.

The dashboard shows completed sales and received purchases, stock metrics, and a sales/purchase chart. Users with sales access also see the four latest sales orders, including their current statuses, with links to order details and the full sales list. Dates use Asia/Manila and currency is PHP. Tables share consistent controls, empty states, responsive layouts, and dialogs.

## Approved business rules

Sales follow `PENDING → CONFIRMED → COMPLETED`; purchases follow `PENDING → ORDERED → RECEIVED`. Pending and confirmed/ordered transactions may be cancelled. Final transactions cannot be repeated or edited. Only pending product lines can be edited, and their prices are recalculated from current product values.

New sales are tax-free (`tax = 0`). Product selling prices determine sales prices; product unit costs determine purchase prices. Prices are saved on transaction items; completion validates those item totals. Browser totals are previews only.

Sale completion decrements stock, records positive `SALE` movement magnitudes, and posts **Cash DEBIT / Sales Revenue CREDIT**. Purchase receipt increments stock, records `PURCHASE` movements, and posts **Inventory DEBIT / Accounts Payable CREDIT**. Each pair uses the same transaction amount. This is a simplified cash-sales and supplier-credit workflow; payment settlement, returns, COGS, and tax calculation are not implemented.

Creating or editing a pending sales order checks each requested quantity against current stock and rejects the entire order with an available-stock error if any product is short. Pending orders do not reserve or deduct stock; availability is checked again at completion. Purchase orders can exceed current stock.

Status changes, stock changes, audit records, and ledger postings commit in a single serializable Prisma transaction. Conditional stock updates prevent overselling and conditional status updates prevent duplicate effects. Conflicts return an actionable retry message. Stock adjustments update stock and movement history together; no accounting effect is invented for an adjustment.

Inventory report value uses current product unit cost, not a historical inventory costing method. Reports exclude pending and cancelled business transactions.

## Access and security

| Role | Access |
| --- | --- |
| ADMIN | All modules |
| SALES | Sales, customers, read-only inventory, dashboard |
| INVENTORY | Inventory, purchasing, suppliers, dashboard |
| FINANCE | Finance, reports, dashboard |
| GUEST | All modules, read-only |

**View as guest** on the login page opens a built-in Guest identity with a signed, eight-hour session. It requires no password or database user and cannot be assigned through user administration. Guests can browse all modules, records, reports, and user listings, but all business mutations and password changes are denied on the server. Creation routes redirect to their read-only lists. Guest access exposes the workspace's existing data to anyone who uses the login page. No PostgreSQL role constraint or migration changes are needed.

The header includes the existing browser theme control, a notification bell with an empty-state panel (notification delivery is not implemented), and an account dropdown with logout. Dropdowns support keyboard navigation, Escape, and outside-click dismissal.

Protected pages and API operations enforce permissions on the server. The browser never connects to PostgreSQL. Signed HTTP-only sessions expire after eight hours; registered user roles are loaded from the database for each authorization check; Guest is resolved from the signed session. Changing a password invalidates other sessions. Mutations validate their request origin and inputs. Password hashes and secrets are never returned to the browser.

The login limiter is per process (five attempts per email per fifteen minutes). A distributed deployment needs a shared rate limiter. List data currently loads once per page; filtering, sorting, and eight-row pagination run in the browser, following the Products pattern. Large datasets will need server pagination.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run prisma:validate
npm run build
npm run test:database
npm run test:ui
```

Unit tests cover validation, permissions, signed sessions, money, filters, stock direction, transitions, and simulated transaction failures. `test:database` uses temporary records inside a transaction that always rolls back; it does not alter existing business records, though PostgreSQL sequence counters can advance.

Browser tests use five-minute signed sessions for existing database users to inspect pages, forms, filters, permissions, and mobile layouts without submitting business changes. They require local `DATABASE_URL`, `SESSION_SECRET`, and existing ADMIN/SALES users. They use installed Edge on Windows, or Playwright Chromium elsewhere (`npx playwright install chromium`). Screenshots are saved under ignored `test-results/`. Run UI tests only against a local development database.

The seed script intentionally inserts nothing. Receipt uploads and unsupported database fields are not fabricated.

On Windows, a running development server can lock Prisma's query-engine DLL and prevent the generation step in `npm run build`. Stop that server before regenerating the client. If the schema and generated client are already current, `npm exec next build` verifies the application without replacing the locked DLL.

See [architecture](docs/architecture.md) for the service and component boundaries.

