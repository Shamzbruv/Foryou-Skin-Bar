# Data API permissions and unpaid cancellations

Supabase's October 30, 2026 change affects newly created public-schema tables. Existing grants stay in place. The live project was inspected on October 23: all public tables have RLS enabled and existing API grants are present. No broad production grant reset is required.

Every table-creating migration now includes explicit role grants. Anonymous access is limited to the reads and form submissions used by the storefront; authenticated access remains governed by the existing RLS policies. Checkout sessions are only readable by admins through the authenticated Data API; writes run on the server. The new cancellation RPC is executable only by the service role, uses SECURITY INVOKER, and checks for an active admin profile.

For future migrations, include RLS, the intended row policies and explicit least-privilege GRANT statements in the same transaction as CREATE TABLE. Include service_role privileges for server-side operations. Do not restore automatic grants globally. UUID primary keys do not require sequence grants; grant USAGE explicitly if introducing identity/serial sequences.

The older migration history contains a legacy June 18 checkout schema with duplicate order-table definitions. This change adds explicit grants to those scripts but does not claim that a complete reset/replay of the legacy history is supported. A future schema-baseline project should resolve that existing conflict before using `supabase db reset` or creating a fresh database from this history.

## Admin cancellation

Admin Orders now offers **Cancel & notify** for unpaid/unconfirmed orders and saved checkouts. It requires a reason, keeps the record, records the actor/time, and queues a customer email. Confirmed payments, partial payments and fulfilled orders require separate review. Duplicate cancellation requests do not send duplicate mail. The response reports sent, queued, pending email configuration, failed, or missing-address states; check Email Logs if delivery is not confirmed.

The database operation is atomic. A late Fygaro payment remains recorded against a cancelled order and sends review wording instead of an instruction to prepare the order. No automatic refund is issued. The existing customer-request approval workflow remains available.

## Verification and release

- `node --test tests/unpaid-cancellations.test.js`
- `tests/unpaid-cancellation.sql` runs against a database with the cancellation migration installed. It uses test records and rolls back the entire transaction. It sends no email.
- Database cancellation logic was verified in a transaction that installed the migration, ran the integration assertions, and rolled back all changes. The persistent production migration requires approval.
- Apply `20261023223959_admin_unpaid_cancellation_and_explicit_grants.sql` before deploying this application change.
- Test the Orders page with pending and cancelled checkout rows, and unpaid and paid orders. Cancel & notify should only be offered for eligible entries; cancelled entries remain visible.
- Existing security and performance advisories were inspected; this focused update does not resolve the unrelated legacy advisories.

Browser rendering verification could not run in this environment because the Chromium download failed. JavaScript syntax and route behavior were checked independently.
