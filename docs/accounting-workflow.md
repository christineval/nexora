# Cash sales, purchasing and the general ledger

## Business rules

- One catalog product keeps its SKU when supplier prices change. Purchase lines accept the actual supplier unit cost and store it in `purchase_items.unit_price`. Totals are calculated with Prisma Decimal on the server. Omitting a purchase cost on creation uses the current product cost as a default for compatibility; the user interface requires a reviewed cost. Pending edits preserve saved costs unless explicitly changed. Ordered and received line prices are locked.
- Sales remain tax-free cash sales. Completing a sale confirms that full payment has already been collected. Revenue uses saved selling prices. No customer credit or separate sales collection is introduced.
- Moving weighted average is the approved costing method. Receipt adds the purchase line value to `products.inventory_value`. The displayed `unit_cost` is the remaining value divided by quantity, rounded to cents. The total value, not the rounded unit average, is authoritative. Sales allocate the proportional stock value to cents and consume every residual cent when the final units leave stock. Concurrent stock changes fail and roll back instead of overwriting valuation.
- Completed sales post Cash debit / Sales Revenue credit and Cost of Goods Sold debit / Inventory credit. Zero inventory cost produces no zero-value cost journal. Receipt posts Inventory debit / Accounts Payable credit. These entries and stock changes commit in the same serializable transaction.
- Goods receipt and cash payment are separate events. Payment is available only for received purchases. Partial payments are supported; a payment cannot exceed the remaining balance or be future-dated or dated before the purchase. A payment debits Accounts Payable and credits Cash without changing stock. Each journal must balance and satisfy the existing ledger precision.
- Payment permission follows the existing purchasing write policy: ADMIN can pay any received purchase; INVENTORY can pay only their own. FINANCE reads the shared ledger and retains existing report ownership restrictions. No role gains purchasing access through this feature. Guests use synthetic records and cannot save payments.
- Payment records use a unique key per authenticated creator. Retrying an unchanged request returns the original payment. Reusing a key with changed details fails. Serializable transactions and an ownership-scoped write to the order header protect the balance against concurrent payments. Conflicts require refreshing/retrying the same request.
- Saved payments are append-only in PostgreSQL. The interface asks users to confirm that cash has actually been paid. The payment, journal and audit event commit together. The ledger reference identifies the payment; its description identifies the purchase. References are business links, not database foreign keys on the ledger.
- Product cost cannot be manually changed while stock is held. Supplier cost changes belong on purchase lines. Selling prices remain independently controlled; the purchase form warns when the cost exceeds the selling price.
- Stock adjustments preserve moving-average valuation and record movement cost, but retain the existing inventory-only accounting policy. They do not silently create expense, income or equity postings. Opening stock created through Products also follows the existing opening-adjustment policy. Finance must reconcile these items separately before treating the ledger inventory balance as the full stock value.

## Deployment and existing data

Review `prisma/migrations/20261026000000_purchase_payments_and_costing/migration.sql` before deployment. Do not run the updated live application until this migration is applied through the approved migration workflow. The generated client expects the new valuation column, movement cost and payment table.

The migration adds columns and a payment table, constraints, indexes and append-only payment protection. It initializes the current opening stock value to `stock_qty × unit_cost`, using the stored cost at deployment. This is a prospective baseline that needs a business review, not reconstructed historical costing. Existing movement costs remain NULL. Existing orders, item prices, ledger entries and audit records are retained.

Before applying the migration:

1. Back up the database using the existing backup procedure and review outstanding migrations.
2. Check current quantities and unit costs against an agreed stock count and valuation date. Review stock adjustments and opening stock separately.
3. Reconcile previously received purchases against supplier payment evidence. The system has no historical payments to infer; received purchases initially show no recorded payments. Enter only verified payments to avoid duplicate or incorrect settlement.
4. Review opening Cash, Inventory and Accounts Payable with the person responsible for accounting. No opening journal or historical COGS is fabricated by this migration.
5. Apply the reviewed migration only after explicit approval, regenerate Prisma and deploy the application together. Run `npm run test:database` against a suitable development database with the migration installed. Its temporary records roll back; sequence counters can advance.

The ledger guide opens from **Finance → General Ledger → Ledger guide** and explains the workflow with peso examples, debit/credit meanings, source references, gross profit and limitations. Debit less credit for the current filters is not a cash or profit balance. Even balanced entries do not prove all transactions or opening balances have been recorded.

Returns, payment reversals, bank accounts, tax calculation and accounting period closing are outside this change. A mistaken payment requires an explicitly reviewed correction workflow; users must not enter another payment as a correction.

## Verification

Unit and service-harness tests cover decimal pricing, moving-average cost and cent allocation, journal balancing, partial/final payments, idempotency, overpayment, authorization and role changes, stale guards and rollback failures. Invoice imports and pending purchase edits retain line-cost snapshots. Browser tests cover editable purchase prices, mobile layout, guest payment previews and keyboard access to the beginner guide.

Service-harness tests simulate transactions; they do not substitute for database concurrency tests. Live integration checks require the migration and a reachable development database.
