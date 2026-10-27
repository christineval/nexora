# Guest demo snapshot

Guest pages display the approved demo records exported from the separate local PostgreSQL database `erp_lite`. They use `src/server/demo/guest-snapshot.json`, bundled with the application, rather than generated sample records or runtime database queries. Production guests can view this snapshot while the local computer and PostgreSQL are off.

Signed-in users continue to use `DATABASE_URL`. Guest data never falls back to that connection, including when IDs overlap or a record is absent from the snapshot. Guest writes are denied by server authorization and shared mutation hooks. Guest screens expose browsing, filtering and details only; creation, editing and administration routes are unavailable. User account lists and audit records are not exported or accessible to guests. The signed guest identity is unchanged.

## Refresh the data

1. Set `GUEST_DATABASE_URL` on the exporting machine in the private `.env`, pointing to the local `erp_lite` database. URL-encode special characters in the password. Leave `DATABASE_URL` unchanged.
2. Run `npm run guest:export` (use `npm.cmd` on PowerShell if required).
3. Review the resulting snapshot changes, build Nexora and redeploy it. Production does not need `GUEST_DATABASE_URL`.

The exporter takes a consistent, read-only PostgreSQL transaction and selects only the fields used by the guest screens. It does not migrate or write to `erp_lite`. Password hashes, credentials, session records and audit logs are excluded. The connection URL is never stored in the snapshot. A failed export does not replace the previous snapshot. The snapshot contains public demo content, including demo contacts and business creator names, but excluding user account lists, and should be exported only from the approved demo database.

The banner shows the capture time. Local database changes do not appear in production until another export, build and deployment. Dates, stock quantities, transaction statuses, item prices, order history and ledger entries are preserved as recorded. Dashboard totals are derived from completed sales and received purchases in the snapshot.

## Legacy source records

The current `erp_lite` schema predates supplier barcode mappings, moving-average inventory valuation and purchase payment tracking. Absent fields are not fabricated. Purchase payment status is shown as **Not tracked**, rather than implying that old purchases are unpaid. Inventory reports label value as an estimate based on the recorded product cost. These demo records do not alter the accounting behavior of signed-in users.

## Production dependencies and checks

Guest page data is independent of both database connections. Existing sign-in, logout and HTTP API security rate limiting still use the configured hosted database; snapshot export does not disable those protections. API reads return snapshot records after the normal security checks.

Unit tests check exact record preservation, relationship/history lookup, derived totals, missing IDs, database isolation, credential exclusion, export failure behavior and denied guest writes and administrator access. Production browser tests use a signed guest session with an unavailable database and no export connection to verify every guest module and detail route. Their API check expects the existing rate limiter to report unavailable service; API data and authorization are covered separately with a mocked limiter and in the connected browser suite.
