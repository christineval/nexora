# AGENTS.md

Repository guide for Codex and other coding agents working on **Nexora**, a centralized business automation system built as a single full-stack Next.js application.

Read this file before changing code. Inspect the relevant implementation, Prisma schema, database constraints, validation schemas, and nearby tests before editing. Do not invent database fields, roles, statuses, routes, business rules, or financial/inventory behavior.

Act as a senior TypeScript/Next.js engineer, PostgreSQL data modeler, ERP application architect, UI/UX engineer, accessibility specialist, and teacher. Prioritize transactional correctness, traceability, security, maintainability, and clear business workflows.

## First Rule: Do Not Guess

- Inspect relevant files before editing.
- Treat the current PostgreSQL/Prisma schema and implemented business rules as the source of truth.
- Do not invent API routes, model fields, enum/status values, role permissions, accounting behavior, or inventory rules.
- If documentation and implementation disagree, report the difference rather than silently choosing one.
- Preserve existing UI/UX unless the task explicitly requests a design change.
- Keep changes scoped. Do not refactor unrelated modules while implementing one feature.
- Do not introduce a second backend, separate client/server applications, another ORM, state-management framework, or architectural migration without explicit approval.

## Project Goal

Nexora is a portfolio-grade centralized business operations system.

The core architectural principle is:

```text
Business Event
     |
     v
Next.js Server
     |
     v
Business Service
     |
     v
PostgreSQL Transaction
     |
     +------> Sales / CRM records
     +------> Inventory records
     +------> Finance records
     |
     v
Reporting
```

A single business event should update all affected modules consistently.

Example: completing a sales order may create/update:

1. the sales order,
2. order items,
3. product stock,
4. inventory movement records,
5. ledger entries,
6. customer sales history/reporting data.

These related writes must be atomic when partial completion would leave the ERP inconsistent.

## Technology Stack

Current intended stack:

- Next.js with App Router
- React
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma ORM
- Zod for input validation
- ESLint
- Next.js Route Handlers and/or Server Actions where appropriate

Do not add Express, Flask, NestJS, a separate API repository, or another database layer unless explicitly requested.

This is a target structure, not a requirement to create empty folders. Add modules and layers only when real code needs them.

## Layer Responsibilities

### `src/app`

Owns routing and route-level composition.

- `page.tsx`: route UI.
- `layout.tsx`: shared layouts.
- `loading.tsx`: route loading UI when useful.
- `error.tsx`: route error boundaries when useful.
- `api/**/route.ts`: HTTP boundary for Route Handlers.

Keep complex ERP business logic out of route files.

### `src/components`

Owns reusable presentation.

- `ui/`: generic primitives.
- `layout/`: sidebar, header, navigation.
- feature folders: reusable feature-specific components.

A component must not directly instantiate Prisma or connect to PostgreSQL.

### `src/server`

Server-only application/business code.

- `db/`: Prisma client and database infrastructure.
- `services/`: use cases and cross-table ERP workflows.
- `repositories/`: reusable persistence queries when abstraction provides real value.

Do not create repository wrappers for trivial one-off Prisma calls merely to satisfy a pattern.

### `src/validations`

Owns Zod schemas for untrusted input.

Validate data at trust boundaries before it reaches business logic.

### `src/lib`

Shared infrastructure and utilities that are not feature business logic.

### `prisma`

Owns the Prisma data model, migrations, and development seed data.

## Client/Server Boundary

The browser must never connect directly to PostgreSQL.

Expected flow:

```text
React UI
   |
   | request / server action
   v
Next.js server boundary
   |
   +--> authentication / authorization
   +--> Zod validation
   |
   v
ERP service
   |
   +--> business rules
   +--> Prisma transaction
   |
   v
PostgreSQL
```

Keep Prisma imports in server-only code. Never expose `DATABASE_URL`, database credentials, password hashes, or server secrets to Client Components.

Use `"use client"` only where browser state, event handlers, hooks, or browser APIs require it. Prefer Server Components for read-oriented pages where practical.

## Current ERP Domain Model

The initial ERP domain consists of these core tables/models:

1. `users`
2. `customers`
3. `suppliers`
4. `products`
5. `orders`
6. `order_items`
7. `purchase_orders`
8. `purchase_items`
9. `inventory_movements`
10. `ledger_entries`

Do not create persisted `sales_reports` or `purchase_summaries` merely to display reports. Reports should initially be derived from transactional data through queries/aggregations. Introduce views, materialized views, or summary tables only when there is a demonstrated requirement.

## Core Relationships

Expected cardinalities:

```text
customers       1 ---- * orders
users           1 ---- * orders
orders          1 ---- * order_items
products        1 ---- * order_items

suppliers       1 ---- * purchase_orders
users           1 ---- * purchase_orders
purchase_orders 1 ---- * purchase_items
products        1 ---- * purchase_items

products        1 ---- * inventory_movements
users           1 ---- * inventory_movements
users           1 ---- * ledger_entries
```

`reference_type` + `reference_id` in inventory/ledger records may be used as a polymorphic business reference. Do not pretend it is a database-enforced foreign key unless the schema actually implements one.

## Database Conventions

Use PostgreSQL-compatible types and constraints.

General conventions:

- Primary IDs: `BIGINT` / Prisma `BigInt` when matching the existing database.
- Names/emails/codes: appropriate `VARCHAR`/text mappings.
- Money: `NUMERIC(12,2)` or the precision already established by the schema; never JavaScript floating-point arithmetic for authoritative monetary calculations.
- Quantities: integer unless the business explicitly supports fractional units.
- Instants: `TIMESTAMPTZ` where exact date/time matters.
- Date-only values: PostgreSQL `DATE`.
- `created_at` / `updated_at`: timestamps.
- Foreign-key fields must use a compatible type with their referenced primary key.
- Add indexes to frequently filtered/joined foreign keys and reporting dates where justified.
- Use database constraints for invariants that the database can enforce safely.

Prefer consistent `snake_case` at the PostgreSQL layer. Follow Prisma mappings if application model names use a different convention.

## Existing Database And Prisma

The PostgreSQL database already exists.

Do not assume Prisma originally created it.

When first connecting Prisma to the existing database, the intended workflow is:

```sh
npx prisma db pull
npx prisma generate
```

Inspect the generated `schema.prisma` before making application assumptions.

After Prisma is established as the project's schema/migration workflow, use migrations deliberately for future schema changes.

Do not run destructive database commands, reset the database, drop tables, truncate production-like data, or apply migrations without the user's explicit request.

Never use `prisma db push --force-reset` or equivalent destructive behavior unless explicitly authorized.

## Transaction Rules

Cross-module ERP workflows are the most important correctness boundary.

Use `prisma.$transaction` when multiple dependent writes must succeed or fail together.

A sales completion workflow may include:

```text
Create/confirm order
        |
        +--> create order items
        +--> validate stock
        +--> update product stock
        +--> create SALE inventory movements
        +--> create financial ledger entries
```

A purchasing receipt workflow may include:

```text
Receive purchase order
        |
        +--> validate purchase state
        +--> update product stock
        +--> create PURCHASE inventory movements
        +--> create financial ledger entries
```

Do not allow a workflow to commit only some of these changes when that would make modules disagree.

Never report success to the UI until the authoritative transaction succeeds.

## Inventory Rules

`products.stock_qty` is the fast current-stock value.

`inventory_movements` is the stock audit trail.

When stock changes through an ERP workflow:

1. validate the requested quantity,
2. update `products.stock_qty`,
3. create the matching `inventory_movements` record,
4. perform both within the same database transaction.

Typical movement types:

- `PURCHASE`
- `SALE`
- `ADJUSTMENT_IN`
- `ADJUSTMENT_OUT`

Use the actual schema values if they differ.

Never silently allow stock to become negative unless the business rule explicitly supports backorders/negative inventory.

Do not directly edit `stock_qty` from random UI/API code without also preserving the required audit trail.

## Sales Rules

An order is the header/business transaction.

`order_items` contains the products sold in that order.

Do not model every product line as an independent order.

Order totals must be calculated/validated server-side. Never trust a browser-supplied `subtotal`, `tax`, `unit_price`, or `total_amount` as authoritative without applying the project's pricing rules.

Before completing a sale:

- verify the customer where required,
- verify products exist and are sellable,
- verify quantities,
- verify available stock,
- use authoritative product/pricing rules,
- enforce the valid order status transition,
- commit related inventory/finance effects atomically.

## Purchasing Rules

A purchase order is the purchase header.

`purchase_items` contains purchased product lines.

Suppliers belong to purchase orders, not as a single free-text supplier property on a product.

Receiving a purchase is the event that should normally increase inventory. Creating a pending purchase order should not automatically imply stock is physically available unless the implemented workflow explicitly says so.

Prevent receiving the same purchase twice.

## Finance Rules

Nexora uses `ledger_entries` as a simplified finance ledger.

Typical fields include:

- transaction date,
- account name,
- entry type,
- amount,
- reference type,
- reference id,
- description,
- creator.

Valid entry types should come from the schema, normally `DEBIT` and `CREDIT`.

Do not invent accounting entries casually. When implementing finance automation, document the business/accounting rule being applied.

Money must use decimal-safe values. Do not rely on JavaScript `number` for authoritative decimal accounting calculations when Prisma/PostgreSQL decimal values are available.

If implementing double-entry behavior, validate that debits and credits balance within the transaction.

## CRM Rules

Customers are first-class records and orders reference customers.

Customer purchase history should be derived from customer/order relationships rather than duplicated into an unrelated history table unless a real requirement demands it.

Avoid exposing unnecessary customer information in client payloads.

## Reports

Reports should read from authoritative transactional tables.

Examples:

- sales totals from completed orders,
- purchase totals from received/valid purchase orders,
- inventory movement history from `inventory_movements`,
- current inventory from `products.stock_qty`,
- customer sales history from customers + orders,
- finance views from `ledger_entries`.

Keep report filters and status semantics consistent with the underlying business workflow.

Do not count cancelled/pending transactions as completed revenue or received purchases unless the requirement explicitly says so.

## Authentication And Authorization

Initial roles are expected to include:

- `ADMIN`
- `SALES`
- `INVENTORY`
- `FINANCE`

Use the actual database/auth implementation as source of truth if roles change.

Intended module access:

```text
ADMIN
  all authorized ERP modules

SALES
  dashboard
  sales
  customers
  read-only product/inventory information as needed

INVENTORY
  dashboard
  inventory
  purchasing
  suppliers

FINANCE
  dashboard
  finance
  reports
```

These are product intentions, not a substitute for server-side authorization.

Hiding navigation items is UX only. Every protected server action/API operation must enforce authorization on the server.

Never trust a role sent by the browser.

For every request that reads or changes a protected object, authenticate and authorize on the server before accessing the object. Enforce the applicable ownership or shared-access policy for the requested object and any referenced objects, including IDs from paths, query strings, and request bodies. Apply the same scope to lists, details, histories, reports, and mutations. Neither an authenticated session nor a valid object ID grants access by itself. Never use browser-supplied roles, owner IDs, or creator IDs as proof of access. `created_by` is an audit field; do not silently treat it as ownership without an established business rule. Add regression coverage for cross-user access, role changes, and tampered object references when implementing object access rules.

Approved order ownership rule: non-admin users can access only sales and purchase orders whose `created_by` equals their authenticated user ID, within their module permissions. ADMIN users can access all orders. Apply the same creator scope to order lists, details, customer/supplier order histories, order reports, dashboard order totals, edits, and status changes. Reports access does not bypass ownership. Return not found for inaccessible order IDs and keep ownership predicates in transactional mutation guards. Guests use synthetic demo records only.

Passwords must be stored only as secure password hashes. Never return `password_hash` to the client.

## Route Handler Workflow

For an HTTP endpoint:

1. Inspect the existing route, validation schema, service, Prisma model, and tests.
2. Authenticate the request where required.
3. Authorize the operation.
4. Parse and validate untrusted input with Zod.
5. Call a server service/use case.
6. Let the service enforce business rules and transactions.
7. Return the smallest useful response.
8. Map expected errors to safe HTTP responses.
9. Do not expose Prisma errors, SQL details, stack traces, secrets, or internal implementation details.

A Route Handler should remain thin.

Conceptual example:

```ts
export async function POST(request: Request) {
  const session = await requireSession();
  requirePermission(session, "sales:create");

  const body = await request.json();
  const input = createOrderSchema.parse(body);

  const order = await createSalesOrder({
    ...input,
    createdBy: session.user.id,
  });

  return Response.json(order, { status: 201 });
}
```

The exact auth/error helpers must follow the implementation that exists in the repository; do not invent them just because they appear in this example.

## Service Rules

Services own business workflows, not HTTP details.

Example responsibility:

```text
sales.service.ts
  createSalesOrder()
  completeSalesOrder()
  cancelSalesOrder()

inventory.service.ts
  adjustInventory()
  getStockMovements()

purchasing.service.ts
  createPurchaseOrder()
  receivePurchaseOrder()

finance.service.ts
  createLedgerEntries()
```

A service may coordinate multiple Prisma models inside one transaction.

Avoid circular service dependencies. Extract a focused shared server helper when multiple workflows genuinely share the same invariant.

## Repository Rules

Repositories are optional.

Use them when:

- a query is reused,
- query complexity deserves isolation,
- persistence details would otherwise dominate a service,
- a test boundary materially benefits.

Do not add a repository layer around every single Prisma call.

Services may use the transaction-scoped Prisma client directly when that keeps an atomic workflow clear.

## Validation

Treat all browser/request data as untrusted.

Use Zod for request/form validation where appropriate.

Validate:

- IDs,
- required strings,
- email formats,
- quantities,
- monetary inputs,
- status/action inputs,
- arrays of order/purchase items,
- duplicate product lines where relevant.

Client validation improves UX. Server validation is authoritative.

Database constraints remain the final integrity boundary for constraints they can enforce.

## UI And UX

Nexora should look like a professional business application rather than a collection of CRUD pages.

Main navigation should broadly follow:

```text
Dashboard

Sales
  Sales Orders
  Customers

Inventory
  Products
  Stock Movements

Purchasing
  Purchase Orders
  Suppliers

Finance
  General Ledger

Reports
  Sales
  Purchases
  Inventory

Administration
  Users
  Settings
```

Only show sections authorized for the current user.

For new/touched screens:

- preserve established visual patterns,
- use Tailwind consistently,
- reuse existing components,
- provide clear page hierarchy,
- use visible labels for form fields,
- provide loading, empty, error, and success states,
- disable duplicate submissions,
- keep destructive actions explicit and confirm where appropriate,
- make status visible through text, not color alone,
- use accessible labels and keyboard interactions,
- keep tables usable on smaller screens,
- use pagination/search/filtering for growing business datasets,
- format currency and dates consistently.

Do not create a custom UI primitive when an existing project component already fits.

## Dashboard

The dashboard is a reporting/read model, not the source of business truth.

Possible metrics:

- completed sales,
- purchase totals,
- low-stock products,
- pending orders,
- recent transactions,
- sales trends.

Derive these from authoritative transactional data.

Do not begin implementation by building fake dashboard metrics while the underlying workflow is not functional.

The first major milestone is the vertical sales workflow.

## Recommended Implementation Order

Unless the task requires another order:

1. Connect Prisma to the existing PostgreSQL database.
2. Inspect and normalize the Prisma schema mappings.
3. Establish authentication and server-side role checks.
4. Build Products CRUD.
5. Build Customers CRUD.
6. Build Sales Order creation.
7. Implement sales completion transaction:
   - order/order items,
   - stock validation,
   - stock update,
   - inventory movement,
   - ledger entry.
8. Build sales/order views.
9. Build Suppliers.
10. Build Purchase Orders.
11. Implement purchase receiving transaction.
12. Build Finance views.
13. Build Reports.
14. Expand dashboard metrics.
15. Build administration/settings as needed.

Prefer a working end-to-end vertical slice over many unfinished screens.

## TypeScript Style

- Keep TypeScript strict.
- Avoid `any`; use `unknown` at untrusted boundaries and narrow it.
- Prefer explicit domain/input types where they improve readability.
- Prefer `const`; use mutation only where appropriate.
- Use async/await consistently.
- Keep functions focused.
- Use descriptive business names.
- Avoid unnecessary abstractions and generic "manager/helper" classes.
- Do not suppress TypeScript or ESLint errors without a documented reason.
- Do not add dependencies when the existing stack can solve the problem cleanly.

Follow the repository's established naming conventions. For new TypeScript modules, prefer consistent lowercase/kebab-case or the convention already established by the project.

## React / Next.js Rules

- Prefer Server Components unless interactivity requires a Client Component.
- Add `"use client"` at the narrowest useful boundary.
- Do not import server-only modules into Client Components.
- Keep database access on the server.
- Do not fetch through the app's own HTTP API from a Server Component when it can safely call the server service/data layer directly.
- Use Route Handlers when an actual HTTP boundary is needed, especially for client-side mutations or external consumers.
- Use Server Actions only when they fit the existing project pattern; do not mix mutation styles randomly.
- Revalidate/cache deliberately after mutations. Do not leave stale ERP data visible when correctness matters.
- Treat search params and route params as untrusted input.

## PostgreSQL / Prisma Safety

Before schema work:

1. inspect `prisma/schema.prisma`,
2. inspect relevant migrations,
3. compare against the actual database when access is available,
4. identify whether a requested change is additive, destructive, or data-transforming.

Never casually:

- drop a table/column,
- reset the database,
- truncate business records,
- rewrite migration history,
- delete audit records,
- change money precision,
- change primary/foreign-key types,
- make nullable data required without a migration plan.

Inventory movements and ledger entries are audit-sensitive records. Avoid destructive updates/deletes unless the business requirement explicitly calls for correction behavior.

## Security

- Never expose `.env` contents.
- Never commit credentials.
- Keep `.env` in `.gitignore`.
- Provide `.env.example` with placeholders only.
- Keep `DATABASE_URL` server-only.
- Hash passwords with an appropriate password hashing algorithm/library already selected by the project.
- Validate and authorize all mutations server-side.
- Do not trust client-calculated prices, totals, roles, user IDs, or status transitions.
- Avoid logging passwords, hashes, database URLs, session tokens, customer-sensitive data, or full request bodies containing sensitive fields.
- Use parameterized ORM/database operations; do not construct unsafe raw SQL from user input.

## Error Handling

Distinguish:

- validation errors,
- authentication errors,
- authorization errors,
- not found,
- invalid business-state transitions,
- inventory conflicts,
- database/internal failures.

Users should receive actionable, business-friendly messages.

Examples:

- `Insufficient stock for Keyboard. Available: 3.`
- `This purchase order has already been received.`
- `This order cannot be completed from its current status.`

Do not expose raw Prisma errors or stack traces to the browser.

## Concurrency And Data Integrity

ERP operations may be performed concurrently.

For stock-sensitive workflows, do not assume that checking stock and updating stock in separate unprotected operations is safe.

Keep stock validation and mutation inside the transaction and use database-safe conditional updates/locking strategies when necessary.

Prevent duplicate completion/receiving operations through status checks and transactional guards.

Design important mutations to fail safely rather than silently double-applying inventory or ledger effects.

## Testing And Verification

Use the lightest meaningful verification for the risk.

Common commands may include:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx prisma validate
npx prisma format
```

Use the actual scripts in `package.json`; do not assume all commands exist.

Add/update targeted tests when changing:

- monetary calculations,
- inventory calculations,
- status transitions,
- permissions,
- Zod validation,
- order completion,
- purchase receiving,
- transaction behavior,
- reporting filters,
- reusable interactive UI.

For cross-module transaction workflows, test both success and failure behavior where practical.

A failure halfway through a sales/purchase workflow must not leave partial database changes.

Do not run destructive migration/database tests against a database containing important data.

## Code Comments

Keep comments human, concise, and intentional.

Prefer self-explanatory code.

Add comments only for:

- a non-obvious business rule,
- a concurrency/transaction constraint,
- an accounting reason,
- a workaround,
- an external contract,
- an implementation detail whose reason is not apparent.

Prefer:

```ts
// Keep the stock check inside the transaction so concurrent sales can't oversell.
```

Avoid:

```ts
// Update the product stock.
```

Do not add decorative section comments or AI-style explanations throughout ordinary code.

## Documentation

Keep the README useful for portfolio reviewers.

It should eventually explain:

- project purpose,
- architecture,
- stack,
- ERP modules,
- database setup,
- environment setup,
- development commands,
- role model,
- core automation workflow,
- screenshots/demo,
- deployment.

When a business rule or architecture decision changes materially, update relevant project documentation in the same task when appropriate.

## Before Finishing A Task

Check what applies:

- Relevant implementation and schema were inspected before editing.
- Client/server boundaries remain intact.
- No Client Component accesses Prisma/database code.
- Input is validated server-side.
- Authorization is enforced server-side.
- Business rules live in services rather than UI code.
- Cross-table dependent writes use a transaction.
- Stock updates preserve inventory audit records.
- Finance effects preserve ledger records.
- Money uses decimal-safe handling.
- Status transitions are validated.
- UI handles loading/error/empty/success states where applicable.
- No secrets or password hashes are exposed.
- Prisma schema/migrations were not changed destructively without authorization.
- Relevant lint/type/tests/build/Prisma validation were run, or blockers were reported.

## End-Of-Task Response

Keep the final response concise and useful.

Include:

- what changed,
- important architectural/business-rule decisions,
- verification performed,
- commands that failed or could not run,
- remaining risks or manual verification,
- file summary grouped into Added, Edited, and Deleted files.

Do not claim runtime/database behavior was verified when it was only inferred from code inspection.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
