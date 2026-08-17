# Architecture

### System shape

Aurum POS has a FastAPI API, async PostgreSQL persistence, a database-backed worker, and a React client distributed through Capacitor Android and a production browser SPA.
Local Compose supplies PostgreSQL.
The lean hosted topology uses host Nginx in front of loopback-only API and worker containers on one EC2 instance with Aiven PostgreSQL; the API remains stateless.
GitHub Pages serves marketing and recovery pages at `aurumpos.net`, while a manually promoted Amplify app serves the authenticated browser client at `app.aurumpos.net`.

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
Cashiers can create sales, access every selected-shop invoice, read current-day sold-item transactions, read metal rates, view today-only sales analytics, and look up one item by an exact barcode through purpose-built responses.
Cashiers cannot browse inventory, stock and catalog values, non-sale activity logs, management analytics, or subscription usage.
Managers additionally control inventory, rates, labels, and management reporting, administrators additionally manage shop settings, staff, and devices, and organization owners alone control administrator membership, organization ownership transfer, shop creation, and Play billing.
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
Hosted Free organizations have one writable primary shop, two distinct seats, and a 500-active-item allowance in the primary shop.
Hosted Pro organizations have up to three writable shops, ten distinct seats, and unlimited active inventory.
After Pro expiry, additional shops remain readable and reject server-side mutations.
Sold and zero-quantity rows do not consume that allowance, and sold rows remain immutable to preserve invoice and audit history.
Item activation locks the shop before counting.
Item updates, sales, and archival append immutable inventory snapshots, while deletion is a soft archive that preserves sale references.
Batch deletion locks and validates the complete shop-scoped selection before archiving any item, so it never partially deletes a mixed selection.
Jewellery pricing is selected per item as fixed rate, fixed making charge, or making charge per gram, independently of its descriptive category.
Jewellery stock is selected per item as quantity or weight; weighted inventory preserves its total weight separately from its remaining balance.
Weighted checkout accepts a decimal gram amount, keeps one internal active row while weight remains, and marks the row sold only at zero remaining weight.
Stone items use quantity stock, Ratti per piece, rate per Ratti, and a fixed `stone` metal discriminator.
The client creates jewellery and stones through one Add Item form by selecting Stone from the metal field, while persisted item types cannot be converted.
Moti uses HSN 7101, every other stone category uses HSN 7103, and all stones use 3 percent GST; the resolved HSN and GST are snapshotted on each sale line.
Tax is derived from item data rather than editable shop settings, and invoices group CGST and SGST totals by rate.
All price and physical snapshots participate in dashboard valuation and immutable invoice rendering without requiring later inventory state.
The client stores validated inventory metal, category, and status filters in a shop-scoped device preference and restores them before the first inventory request.
Customer and optional shop phone fields accept exactly ten Indian digits for new writes without rewriting historical invoice snapshots.
Metal-rate writes preserve one compatible current row and append immutable history for as-of analytics.
Sale creation locks inventory rows, prices with `Decimal`, stores seller, tax, item, and price snapshots, decrements stock, assigns a server-controlled invoice sequence, and records a shop-scoped idempotency result.
Administrators can export every active inventory row as a versioned UTF-8 CSV snapshot from Manage Shop.
The standalone export includes stable item and barcode identity, pricing inputs, the current tax-inclusive unit price, native quantity, stock weight, and item status.
The client persists only a checkout fingerprint and operation UUID so an ambiguous retry reuses the same idempotency key.
Dashboard analytics use bounded date ranges and database aggregates instead of loading sale and inventory graphs into application memory.
Cashier dashboard sales and invoice metrics plus Cashier analytics derive the current calendar day in `Asia/Kolkata`, convert its half-open bounds to UTC, and never accept a client-selected date range.
Cashier recent activity and Transactions use an allowlisted sold-item feed restricted by the server to the current `Asia/Kolkata` calendar day, with barcode or invoice search that cannot be broadened to other activity types.
Management audit history normalizes inventory, rate, sale, shop-settings, invitation, membership, and ownership events into a paginated table contract.
New audit rows preserve actor ID, name, and role snapshots, historical rows identify their actor as Unknown, and worker-generated rows identify their actor as System.
Completed sales remain one management audit row per invoice while their item-sold rows support the Cashier feed and expanded sale details.
Cashier All sales analytics aggregate sale values by Gold Jewellery, Silver Jewellery, Platinum Jewellery, and Stones, while selecting one material drills into its item categories.
Management and Cashier analytics rank the top three items by filtered sales value and report the sold amount as pieces or grams without exposing internal item IDs.
The Cashier barcode lookup has a dedicated allowlisted response and returns no internal item ID, quantity balance, stock weight, pricing inputs, notes, or inventory aggregates.

Evidence:
- `app/modules/subscriptions/service.py::enforce_item_activation_limit`
- `app/modules/sales/routes.py::create`
- `app/modules/sales/service.py::_execute_create_sale`
- `app/modules/items/tax.py::get_tax_profile`
- `app/modules/items/routes.py::cashier_item_lookup`
- `app/modules/dashboard/service.py::get_cashier_analytics`

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

### Shared WhatsApp invoice delivery and printing

Hosted Pro organizations can queue customer invoice delivery through one Aurum-owned WhatsApp Business Account and sender number.
Meta credentials, sender identity, template state, webhook secrets, feature state, and provider billing are application-level Aurum configuration rather than tenant settings.
The approved Utility template identifies the originating store, labels delivery as Aurum POS, and contains no promotional content.
Checkout requires explicit confirmation that the customer requested delivery, sends WhatsApp in addition to the normal shop invoice download, and stores the staff actor, time, consent copy version, organization, shop, sale, recipient, source, and status.
Delivery audit rows use forced shop RLS, while global job-control and keyed recipient-suppression tables support cross-tenant workers and shared-sender opt-outs.
The worker reads only the exact checksum-verified stored invoice, uses fenced leasing and bounded retry, and leaves ambiguous provider timeouts in an unknown terminal state to prevent duplicate automatic sends.
Signed Meta webhooks advance delivery status, synchronize the shared template state, and suppress recipients who opt out or explicitly block Aurum.
A new explicitly confirmed customer request is audited before clearing a global recipient suppression.
Invoice-history download, print, and WhatsApp actions are icon-only, and print retrieves the exact stored PDF through an authenticated shop-scoped endpoint.
Android printing writes the PDF to application cache and passes only a validated app-cache PDF path to the native Android print manager.
Merchant-owned WABAs and sender numbers are reserved for a future enhancement.

Evidence:
- `app/modules/whatsapp/models.py::WhatsAppInvoiceDelivery`
- `app/modules/whatsapp/routes.py::receive_webhook`
- `app/jobs/whatsapp.py::process_whatsapp_deliveries`
- `frontend/src/pages/Invoices.tsx::InvoiceHistory`
- `frontend/android/app/src/main/java/com/duelistraj/aurumpos/AurumPrintingPlugin.java`

### Production release health

The production API exposes a database-free liveness endpoint, a database-backed readiness endpoint, a database-backed worker-heartbeat endpoint, and a version endpoint that reports the source revision, immutable image reference, and non-secret runtime configuration revision.
The private operations repository retrieves each required runtime key from its own KMS-encrypted SSM SecureString, atomically assembles the host `.env`, migrates before API replacement, verifies the new API before starting the worker, and serializes host changes with a deployment lock.
The migration administrator URL is fetched separately and is never installed in the API or worker runtime file.
The public operator template validates the restricted runtime role, pauses the worker before migration, verifies the API release identity, and requires a heartbeat from the uniquely identified replacement worker.
The official client supports Android and the authenticated production browser SPA.
Its signed AAB is released directly to Google Play Internal Testing from an explicitly selected revision that already passed CI, then the same version code is promoted to the Closed Testing `alpha` track.
The private web manifest requires the same Android-approved source revision, pins the toolchain and deterministic artifact checksum, and deploys only through Amplify's manual deployment API.
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
Browser access tokens remain in memory, while the rotating browser refresh token stays in an HttpOnly, Secure, path-scoped SameSite cookie.
Browsers persist only a random untrusted installation UUID and coordinate refresh and logout across tabs without storing or broadcasting credentials.
Dashboard summary and analytics responses expose ordered configured metal rates while retaining the legacy silver-rate fields for client compatibility.
The React client dispatches Cashiers to separate Dashboard, Inventory, and Analytics components so management data fetching code is never mounted for that role.
Transactions presents a normalized Audit Log table to manager-level roles and a current-day Sold Items table to Cashiers, while reusing the existing invoice history without mounting management audit queries for Cashiers.
The authenticated client rotates configured dashboard rates and gives writable manager-level users one device-local reminder after 08:00 Asia/Kolkata when configured rates have not been refreshed during that IST day.
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
- `frontend/src/components/MetalRateReminder.tsx::MetalRateReminder`
- `frontend/src/utils/apiConfig.ts::getApiBaseUrl`
- `app/modules/dashboard/service.py::get_dashboard_summary`
- `frontend/src/pages/Items.tsx::Items`
- `frontend/src/pages/Invoices.tsx::InvoiceHistory`
- `app/modules/subscriptions/service.py::get_entitlement_response`
- `app/jobs/ownership_transfers.py::process_organization_ownership_transfers`
- `frontend/android/app/src/main/java/com/duelistraj/aurumpos/AurumFileNotificationsPlugin.java`
