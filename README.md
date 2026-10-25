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

- Products: search, status/stock filters, sorting, pagination, creation, editing, details, and stock history. The Add Product form accepts an initial whole-number quantity (default 0); positive starting stock creates an ADJUSTMENT_IN movement and stock audit event in the same transaction as product creation. Later manual quantity changes use Stock Movements; product editing cannot change stock. The existing database sequence assigns the SKU. Products created within invoice imports receive their reviewed quantities atomically when the received invoice is saved. Starting stock follows the existing inventory-adjustment behavior and does not post finance entries.
- Customers and suppliers: searchable records, status filters, creation/editing modals, details, and related transaction history. Inactivation retains business records.
- Product archiving: inventory staff and admins can archive and restore products from product actions. Active and Archived views separate the catalog; existing INACTIVE and DISCONTINUED products appear in Archived. Archiving uses INACTIVE, requires acknowledgement of stock on hand, and preserves inventory and history. Restore returns the product to ACTIVE. Archived products are excluded from new transaction and adjustment selectors; restore before using their stock. Only admins can permanently delete an archived product, after entering their current password, and only with zero stock and no sales lines, purchase lines (including pending transactions), or stock movements. Password attempts are limited to five per fifteen minutes per admin. Lifecycle changes and deletion retain audit history atomically; SKUs are never renumbered or reclaimed.
- Sales: one row per order header, item details, pending-order creation/editing, confirmation, completion, and cancellation.
  The sales form switches between Registered Customers (select an active customer) and Walk-in Customers (enter a name). Saving a walk-in order creates a new active customer and the order in the same transaction; failures retain neither record. Walk-in customers then appear in the customer list and can be selected for future orders. Existing orders open with their linked customer selected; no separate persisted customer-type field is added.
- Purchasing: pending purchase creation/editing, ordering, receiving, cancellation, and item details.
  Import Receipt / Invoice reads PNG, JPEG, WebP and PDF documents locally. Review existing/new products, quantities, prices, supplier and date, then save the already-received invoice. The new products, received purchase, stock increments, PURCHASE movements, balanced receipt ledger entries and audit history commit together. Documents are not retained. Existing products use stored costs; reviewed costs apply to new products.
- Inventory movements: product/type/date filters, details, and authorized adjustments. Stored quantities are positive magnitudes; the movement type determines the signed change displayed.
- Finance: ledger search, account/type/date filters, filtered debit/credit summaries, details, and CSV export. Existing audit entries remain read-only.
- Reports: completed sales, received purchases, date filters, trends, top products, details, and CSV exports. Inventory reports show current stock and cost valuation.
- Administration: create users with bcrypt-hashed passwords, edit names/emails/roles, change your password, and select a browser theme.

The dashboard shows completed sales and received purchases, stock metrics, and a sales/purchase chart. Users with sales access also see the four latest sales orders, including their current statuses, with links to order details and the full sales list. Dates use Asia/Manila and currency is PHP. Tables share consistent controls, empty states, responsive layouts, and dialogs.

## Approved business rules

Sales follow `PENDING -> CONFIRMED -> COMPLETED`; planned purchases follow `PENDING -> ORDERED -> RECEIVED`. Invoice imports record deliveries already received and are saved directly as `RECEIVED`, including stock, inventory and ledger effects in the same transaction. Pending and confirmed/ordered transactions may be cancelled. Final transactions cannot be repeated or edited. Only pending product lines can be edited, and their prices are recalculated from current product values.

New sales are tax-free (`tax = 0`). Product selling prices determine sales prices; product unit costs determine purchase prices. Prices are saved on transaction items; completion validates those item totals. Browser totals are previews only.

Sales order dates must be today or earlier in Asia/Manila, enforced in the calendar and server validation. Purchase orders may be planned for future dates. Quantity inputs accept digits; product prices also accept a decimal point. Numeric inputs block text, signs, and exponent notation, including pasted text; server schemas enforce ranges and monetary precision.

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

**View as guest** on the login page opens a built-in Guest identity with a signed, one-hour session. It requires no password or database user and cannot be assigned through user administration. Every guest page, history, report, detail view and read API uses a separate synthetic dataset in `src/server/demo/guest-data.ts`; guest authorization and demo data selectors never load Prisma or connect to PostgreSQL. The shared API rate limiter uses PostgreSQL, including for guest API requests. `src/server/data/erp-data.ts` selects the source from the authenticated server identity. Registered users continue through the live services. Guest records never fall back to database records, including for unknown IDs. Guest pages clearly identify mock data. Business mutations and password changes are denied before database services are loaded, while creation routes open interactive previews. Guests can explore add/edit forms, line controls, pricing suggestions and browser-local invoice OCR against demo records. Save, update and final confirmation buttons are disabled, form handlers guard submissions, and the shared mutation hook blocks guest requests. Guest page rendering requires `SESSION_SECRET` and does not require a database user. Guest API requests require the security migration and a working database for rate limiting. No PostgreSQL role constraint changes are needed.

The header includes the existing browser theme control, a notification bell with an empty-state panel (notification delivery is not implemented), and an account dropdown with logout. Dropdowns support keyboard navigation, Escape, and outside-click dismissal.

Protected pages and API operations enforce permissions on the server. The browser never connects to PostgreSQL. HTTP-only sessions expire after one hour. Registered user sessions use opaque tokens backed by a database registry with at most three active sessions per user; a fourth login evicts the oldest. Registered user roles are loaded from the database for each authorization check; Guest is resolved from its signed cookie. Changing a password invalidates other sessions. Mutations validate their request origin and inputs. Password hashes and secrets are never returned to the browser.

The login limiter is per process (five attempts per email per fifteen minutes). A distributed deployment needs a shared rate limiter. List data currently loads once per page; filtering, sorting, and eight-row pagination run in the browser, following the Products pattern. Large datasets will need server pagination.

## Verification

### Audit history

Administrators can open **Administration → Audit Log** (`/settings/audit`) to view admin and employee events. The read-only log supports server-side pagination and filters for user ID, action, record type, outcome, and inclusive Asia/Manila dates. Employees and guests cannot access the page or `/api/audit`, even by supplying another user's ID or an admin role in the request.

Recorded events include successful logins, invalid-credential login failures, explicit logouts, session-limit/password-change revocations, password changes, user creation/edits/role changes, product creation/edits, customer and supplier creation/edits, stock adjustments, sales and purchase creation/edits/status changes, automatic ledger postings, and authenticated module-access denials. Nested walk-in customer and purchase-product creation is included. Failed logins have an unknown actor because a failed password does not establish identity. Guest demo activity is excluded.

Each entry stores the server-resolved actor ID, name and role at the time, action, affected record reference, outcome, time, and relevant before/after fields. Contact-field changes record field names without their private values. Passwords, hashes, session tokens, email addresses, phone numbers, and street addresses are excluded. Successful business changes and their audit entries commit together; an audit-write failure rolls back the business change. PostgreSQL triggers reject audit updates, deletes, and truncation. Database owners can still alter these protections; this is not an external tamper-proof archive.

Apply the additive `20261021000000_audit_logs` migration through the existing reviewed migration workflow **before running the updated application**. It creates only the audit table, indexes, function and append-only trigger. Existing data is not backfilled. Closing a browser and passive session expiry do not create logout events. Page visits, client-side CSV exports, browser theme changes, invalid form submissions, database maintenance and external SQL changes are not captured by this application-level log.

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

Browser tests create one-hour registered sessions for existing database users to inspect pages, forms, filters, permissions, and mobile layouts without submitting business changes. They require local `DATABASE_URL`, `SESSION_SECRET`, and existing ADMIN/SALES users. They use installed Edge on Windows, or Playwright Chromium elsewhere (`npx playwright install chromium`). Screenshots are saved under ignored `test-results/`. Run UI tests only against a local development database.

Guest isolation unit tests fail if any guest page, read API or denied mutation imports Prisma or a database service. They also check demo relationships, stock reconciliation, balanced ledger records and completed/received dashboard totals. After building the application (`npm exec next build`), run `npm run test:guest` for a production browser test on port 3301 with an intentionally unreachable database. It covers guest sign-in, every module, histories, unknown IDs, read APIs, mutation denials, search and logout without database test actors.

The seed script intentionally inserts nothing. Unsupported database fields are not fabricated.

## Receipt and invoice OCR

Tesseract.js provides free OCR with no API key or per-document fee. PDF.js renders PDF pages for OCR. Workers, WebAssembly and English language data are served from this app; receipt files never leave the browser. `npm install` prepares these assets in ignored `public/ocr/` through `postinstall`. Run `npm run ocr:prepare` if install scripts were disabled, and include the generated assets when deploying.

Supported limits are 20 MB, 24 megapixels per image/page, 10 PDF pages and 100 product lines per order. Images/pages receive local contrast enhancement and automatic straightening for tilts up to 20 degrees. Barcode invoice layouts receive separate numeric recognition for discount and unit-price cells; low-confidence prices stay blank for manual entry. This does not correct perspective distortion or recover cropped text.

For tables with a quantity header and recognizable unit columns, OCR reads quantity and description cells separately using their printed row positions. Quantities contain digits only; units such as PCS and PAIR are ignored. Color-aware contrast reduces interference from highlighters, and numeric quantity crops suppress red pen circles. Barcode sizes containing `/` or `.` are supported without treating dimensions in the product description as quantities. Clearly read prices are preserved; uncertain quantities remain blank rather than being calculated from totals. Review all extracted fields against the invoice, including line-total warnings.

The parser recognizes product-name / quantity / unit-price / line-total rows (quantity may also lead the row), barcode / discount / unit-price / total layouts, and explicitly headed description / quantity / unit-price tables without totals. Barcode and discount columns are separated from descriptions; missing quantities are never inferred from totals or defaulted to one. It first matches the extracted BARCODE against the supplier product code of a single active product, ignoring letter case, Unicode dash variants and spaces around separators while preserving punctuation, digits and leading zeros. Unique exact names/SKUs also auto-match when no saved supplier code conflicts. Similar names, names with an invoice supplier prefix, or conflicting codes select an existing-product suggestion that requires confirmation. Duplicate codes/names and ambiguous suggestions require manual selection; only lines with no candidate default to new product details. Existing products use compact Matched or Review match cards with quantity, invoice unit cost and a product selector. Expand Invoice details and corrections to edit extracted names/codes; internal SKUs are not displayed in invoice review. New-product cards use the same compact quantity/cost and product-match layout, with selling price and compact markup-on-cost controls visible below quantity/cost/matching. Name, supplier code and optional size stay under a collapsed Set up new product section. Each new line starts with a 30% markup suggestion; Apply copies cost plus markup, rounded half up to cents, into the selling price. Changing cost or markup preserves a manually entered price until Apply is selected. Its summary switches to Hide new product details when expanded. Invalid quantities are marked inline, and incomplete product setup blocks saving. Unconfirmed suggestions stay selected until the user explicitly chooses Existing catalog product from the selector; opening the selector alone does not confirm a match. The All items, Needs review and New only pill filters preserve every draft line. Needs review contains existing catalog matches, suggestions and ambiguous matches; new-product drafts appear only in New only and All items, including when they have validation errors. Raw text viewing/pasting has been removed. ISO invoice dates can be suggested; other dates need manual entry. OCR is fallible: check the whole invoice, add missed lines, correct quantities, and combine repeated products before saving. Taxes, discounts and invoice totals are not imported into the existing purchase accounting workflow; authoritative purchase costs still come from stored product costs. Uploaded documents are not retained as attachments.

Each imported line can select an existing product or **Create new product**. New products start with the extracted description and unit price as editable name/cost suggestions; review the name, supplier product code, optional size, unit cost and required selling price. Existing products retain their stored costs. Saving through `POST /api/purchases/import` creates a RECEIVED purchase and immediately adds every reviewed quantity to existing/new product stock. New products use the existing SKU sequence; SKUs, product writes, product audit records and movement writes are batched to reduce database round trips. Stock increments retain ordered conditional guards. The receipt uses the existing accounting rule: debit Inventory and credit Accounts Payable, without assuming the invoice was paid. Product creation, order/items, stock, PURCHASE movements, ledger entries and audit records all commit in one serializable transaction with a 30-second limit (rather than the default five-second Prisma limit); the route advertises a 60-second deployment limit. Any failure rolls back all business writes. Planned purchase creation through `POST /api/purchases` remains pending.

Libraries: [Tesseract.js](https://github.com/naptha/tesseract.js), [PDF.js](https://mozilla.github.io/pdf.js/).

On Windows, a running development server can lock Prisma's query-engine DLL and prevent the generation step in `npm run build`. Stop that server before regenerating the client. If the schema and generated client are already current, `npm exec next build` verifies the application without replacing the locked DLL.

See [architecture](docs/architecture.md) for the service and component boundaries.


Session security and deployment requirements are documented in [the deployment security review](docs/deployment-security-review.md). Sessions expire after one hour; each registered user can keep three active sessions, with the oldest evicted by a fourth login. Apply the additive security migration before deploying this version.


Sales and purchase order access is restricted to the authenticated creator for non-admin users; admins can access all orders. Module permissions still apply. The database query scope is shared by order lists, details, customer/supplier order histories, order reports and dashboard totals. Edits and status changes enforce ownership inside the transaction and retain creator predicates on updates. Inaccessible IDs return not found. Finance report access also remains creator-scoped; a finance user with no orders sees empty order reports. Guest order records remain synthetic demo data. Shared product, customer, supplier, stock-audit and ledger datasets retain their existing module permissions.

Supplier product codes are optional editable VARCHAR(150) values stored in `products.supplier_product_code`, separate from the immutable internal SKU. Apply the additive `20261024000000_supplier_product_code` migration through the reviewed migration workflow before running this version, then regenerate Prisma Client. Existing products keep a null code until edited; there is no automatic backfill. Existing product names/codes are corrected through Products; invoice corrections are saved to the catalog when creating new products. Product permissions remain ADMIN/INVENTORY; the reference mockup does not add an admin-only rule. Code changes enter the existing product audit history.

OCR progress reports engine preparation without a percentage, page recognition as a labeled stage percentage, and row review as completed rows out of detected rows. PDF page numbers remain visible. Only completion is labeled invoice extraction complete. Low-confidence supplier code cells receive a separate recognition pass; no OCR result is guaranteed accurate, and human verification remains required.

Each open invoice form keeps a random import key across save retries. A transaction-scoped advisory lock, serializable isolation and the immutable PURCHASE_RECEIVED audit entry (import key plus validated-payload hash) prevent a retry from adding stock twice. A replay returns the existing creator-scoped received purchase; reusing a committed key with different data is rejected. No schema migration is required. Closing the form or choosing another file starts a new import key; this is request retry protection, not automatic invoice-document deduplication. Users must confirm that the received quantities have not already been recorded (including through opening stock).


Form validation is shared between browser checks and server boundaries. Selling prices may equal unit cost but cannot be lower. Product names are compared ignoring case and repeated whitespace: matching names require distinct, non-empty sizes; a missing size conflicts with any same-name product, including archived products. Customer names and supplier names must each be unique within their own module, including walk-in customer creation; editing a record excludes that record from duplicate checks. User emails are case-insensitively unique. Duplicate order headers are allowed; repeated product lines within an order must be combined. Duplicate checks and writes run inside serializable transactions, so concurrent conflicts fail safely and can be retried. No database migration is applied.

Non-empty supplier product codes (invoice barcodes) must also be unique across products, regardless of name, size or active/archived status. Form previews, purchase-line validation and serializable product writes use the same normalization as OCR matching: case, Unicode dash variants and spaces around separators are ignored; leading zeros and punctuation remain significant. Blank codes are optional and may be shared. Editing a product may retain its own code. No database uniqueness migration is applied.
