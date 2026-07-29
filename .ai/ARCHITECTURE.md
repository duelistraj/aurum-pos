# Architecture

### System shape

Aurum POS has a FastAPI API, async PostgreSQL persistence, a database-backed worker, and a React client packaged for Capacitor Android.
Local Compose supplies PostgreSQL.
The lean hosted topology uses host Nginx in front of loopback-only API and worker containers on one EC2 instance with Aiven PostgreSQL; the API remains stateless.

Evidence:
- `app/main.py::app`
- `app/worker.py::run_forever`
- `compose.dev.yml::services.postgres`
- `compose.cloud.yml::services`

### Tenant request boundary

Business APIs live under `/api/v1`.
Authenticated requests identify a database session, registered device, and selected shop.
Membership roles are read from PostgreSQL.
The shop dependency resolves the organization and sets transaction-local shop, organization, and user settings.
Tenant-aware service queries also carry an explicit `shop_id` predicate instead of relying on session state alone.
Items, immutable item and metal-rate history, current metal rates, sales, sale lines, change logs, and sale idempotency use shop-scoped constraints and forced RLS.
Subscriptions use organization-scoped constraints and forced RLS.
Global worker control tables carry composite tenant foreign keys where they reference tenant data but intentionally remain visible to the cross-tenant worker.
Production API and worker connections use a restricted `NOBYPASSRLS` login, while Alembic receives a separate administrator URL only for the migration container.
Hosted mode is accepted only with the production environment value, so local token exposure and provider shortcuts cannot be enabled by a deployment typo.

Evidence:
- `app/modules/auth/dependencies.py::get_auth_context`
- `app/modules/auth/dependencies.py::get_shop_context`
- `app/modules/items/service.py::get_item_by_id`
- `app/modules/dashboard/service.py::get_dashboard_summary`
- `alembic/versions/c3d4e5f6a7b8_add_saas_tenancy.py::TENANT_TABLES`
- `alembic/versions/d4e5f6a7b8c9_add_deletion_and_idempotency.py::upgrade`

### Identity, membership, and deletion

Owners register with verified email/password or Android Google ID tokens.
First-time Google owners choose their shop name only after Google verifies their identity, while returning members and invited staff continue directly.
Verification email resend uses a generic public response and a database-backed cooldown to avoid account enumeration and email abuse.
The unauthenticated auth-provider endpoint exposes only the public Google Web client ID and enabled state, keeping the backend environment as the authoritative Google audience configuration.
Staff join through hashed, expiring shop invitations.
Owners and administrators can immediately deactivate memberships, while only the organization owner can request a durable ownership transfer to another active member.
Access JWTs contain user and session identity but no role; opaque hashed refresh tokens rotate in the database.
Roles are OWNER, ADMIN, MANAGER, and CASHIER.
Cashiers can view shop data and create sales, managers additionally control inventory, rates, and label exports, administrators additionally manage shop settings, staff, and devices, and organization owners alone control administrator membership, organization ownership transfer, shop creation, and Play billing.
Confirmed account deletions execute after seven days and can be cancelled with the confirmation token until cleanup begins.
Sensitive auth routes use both PostgreSQL-backed account/IP limits and coarse Nginx IP limits.
Password work runs in a capacity-limited thread pool, and every authenticated request must present the device UUID bound to its session.
Session, user, and registered-device state are loaded in one database query, and first shop-device access uses a conflict-safe PostgreSQL insert.
Deletion cleanup cancels Play renewals and deletes exact invoice object keys before owned organizations and user rows are removed.
Owned organizations and their shops are atomically locked and deactivated before external cleanup, an immutable marker permanently closes cancellation once processing starts, and ownership plus the invoice-key set are revalidated before database deletion.

Evidence:
- `app/modules/auth/security.py::create_access_token`
- `app/modules/auth/routes.py::accept_invitation`
- `app/modules/auth/routes.py::google_auth`
- `app/jobs/account_deletions.py::process_account_deletions`

### Inventory, entitlement, and sale flow

Hosted entitlement belongs to an organization.
Self-hosted organizations are unlimited.
Hosted Free organizations have one writable primary shop, two distinct seats, and a 50-active-item allowance in the primary shop.
Hosted Pro organizations have up to three writable shops, ten distinct seats, and unlimited active inventory.
After Pro expiry, additional shops remain readable and reject server-side mutations.
Sold and zero-quantity rows do not consume that allowance, and sold rows remain immutable to preserve invoice and audit history.
Item activation locks the shop before counting.
Item updates, sales, and archival append immutable inventory snapshots, while deletion is a soft archive that preserves sale references.
Metal-rate writes preserve one compatible current row and append immutable history for as-of analytics.
Sale creation locks inventory rows, prices with `Decimal`, stores seller, tax, item, and price snapshots, decrements stock, assigns a server-controlled invoice sequence, and records a shop-scoped idempotency result.
The client persists only a checkout fingerprint and operation UUID so an ambiguous retry reuses the same idempotency key.
Dashboard analytics use bounded date ranges and database aggregates instead of loading sale and inventory graphs into application memory.

Evidence:
- `app/modules/subscriptions/service.py::enforce_item_activation_limit`
- `app/modules/sales/routes.py::create`
- `app/modules/sales/service.py::_execute_create_sale`

### Billing and asynchronous work

The Android bridge queries and launches Play subscriptions.
The API verifies purchase tokens with Android Publisher, checks the obfuscated organization identifier, encrypts tokens at rest, acknowledges purchases, and derives entitlements from server state.
External Google Play calls run outside database transactions, and a token-scoped PostgreSQL advisory lock serializes purchase application.
Pending Google Play acknowledgement is durable database state and remains eligible for worker reconciliation until Google confirms it.
The current Fernet key encrypts new token values while configured previous keys support gradual rotation.
Authenticated RTDN pushes and periodic lease-based reconciliation keep state current and drain the due backlog in bounded batches.
The worker also delivers branded multipart HTML and plain-text messages from the PostgreSQL email outbox through SES.
Email, invoice, Play, and deletion work is claimed with expiring database leases plus unique fencing tokens, processed with bounded concurrency, and finalized only by the current lease owner.
Independent perpetual queue loops run concurrently inside the lean worker process so a slow provider or deletion path does not stall unrelated queues.
Failed email delivery uses bounded attempts and a durable failed state.

Evidence:
- `frontend/android/app/src/main/java/com/duelistraj/aurumpos/AurumBillingPlugin.java`
- `app/modules/billing/service.py::apply_play_purchase`
- `app/modules/billing/routes.py::receive_rtdn`
- `app/worker.py::run_once`

### Invoice document storage

PostgreSQL sales remain the authoritative invoice index.
Every active shop member can browse the selected shop's invoice index through an indexed cursor-paginated API without listing S3.
Sale creation commits a durable invoice job with the immutable sale snapshot and never performs PDF or S3 work inside the request.
The worker claims jobs with expiring leases, renders PDFs off the event loop, and uploads each document to a private S3 object whose key contains only the configured prefix, shop UUID, year, and sale UUID.
Failed jobs use bounded exponential retry while preserving the same object key, and a sale is downloadable only after upload metadata commits.
Authenticated shop-scoped downloads receive a ten-minute presigned URL generated from the exact database key.
Uploads are create-only and accept an idempotent retry only when the existing object's SHA-256 checksum matches.
The deletion worker removes only exact PostgreSQL-indexed keys and never lists the bucket.

Evidence:
- `app/jobs/invoices.py::process_invoice_jobs`
- `app/modules/sales/storage.py::InvoiceStorage`
- `app/modules/sales/routes.py::invoice`

### Production release health

The production API exposes a database-free liveness endpoint, a database-backed readiness endpoint, a database-backed worker-heartbeat endpoint, and a version endpoint that reports the source revision, immutable image reference, and non-secret runtime configuration revision.
The private operations repository retrieves each required runtime key from its own KMS-encrypted SSM SecureString, atomically assembles the host `.env`, migrates before API replacement, verifies the new API before starting the worker, and serializes host changes with a deployment lock.
The migration administrator URL is fetched separately and is never installed in the API or worker runtime file.
The public operator template validates the restricted runtime role, pauses the worker before migration, verifies the API release identity, and requires a heartbeat from the uniquely identified replacement worker.
The official client is Android-first.
Its signed AAB is released directly to Google Play Internal Testing from an explicitly selected revision that already passed CI.
Backend production promotion is an independent immutable-digest pull request in the private operations repository.

Evidence:
- `app/main.py::health`
- `app/main.py::readiness`
- `app/main.py::version`
- `tests/test_app_contracts.py::test_readiness_checks_database_connectivity`

### Client boot and shop state

The React root supplies TanStack Query and shop contexts. Axios adds API prefix,
tokens, device UUID, and shop ID, and serializes refresh retries. Query keys are
shop-namespaced and switching shops clears cached server state. Official cloud
builds ignore saved URLs and use `https://api.aurumpos.net`; self-hosted builds
require a build-time API URL and do not support runtime backend switching.
Debug APKs omit Google Sign-In, while signed Play builds discover the public Google client ID from the backend.
Native Android access and refresh tokens are encrypted with an AES-GCM key held by Android Keystore and are excluded from device backup.
Completed Android downloads are written to app-owned storage, and a native bridge accepts only those app-owned paths before posting a file-backed notification whose read-granted FileProvider URI opens the downloaded PDF or spreadsheet.
Inventory and invoice data remain full tables at viewport widths of 640 pixels and above.
Below 640 pixels, each becomes a compact disclosure table whose essential columns remain scannable and whose expanded row exposes the remaining details and actions.
Each shop belongs to one organization.
Hosted subscriptions, shop limits, and distinct-person seat limits resolve at the organization boundary, while inventory, sales, rates, invoices, staff assignment, and RLS remain shop-scoped.
The organization identifies one primary shop for Free-plan write access after a Pro downgrade.
Additional shops remain readable but server-side write guards reject their mutations until Pro is restored.
Ownership transfers are durable jobs because Google Play renewal cancellation must complete before organization ownership changes.

Evidence:
- `frontend/src/main.tsx::ShopProvider`
- `frontend/src/api/client.ts::client.interceptors`
- `frontend/src/api/queryKeys.ts::queryKeys`
- `frontend/src/utils/apiConfig.ts::getApiBaseUrl`
- `frontend/src/pages/Items.tsx::Items`
- `frontend/src/pages/Invoices.tsx::InvoiceHistory`
- `app/modules/subscriptions/service.py::get_entitlement_response`
- `app/jobs/ownership_transfers.py::process_organization_ownership_transfers`
- `frontend/android/app/src/main/java/com/duelistraj/aurumpos/AurumFileNotificationsPlugin.java`
