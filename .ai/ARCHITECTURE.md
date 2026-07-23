# Architecture

### System shape

Aurum POS has a FastAPI API, async PostgreSQL persistence, a database-backed
worker, and a React client packaged for Capacitor Android. Local Compose supplies
PostgreSQL. The lean hosted topology uses Caddy, API, and worker containers on
one EC2 instance with Aiven PostgreSQL; the API remains stateless.

Evidence:
- `app/main.py::app`
- `app/worker.py::run_forever`
- `compose.dev.yml::services.postgres`
- `compose.cloud.yml::services`

### Tenant request boundary

Business APIs live under `/api/v1`. Authenticated requests identify a database
session, registered device, and selected shop. Membership roles are read from
PostgreSQL. The shop dependency sets transaction-local tenant/user settings;
items, metal rates, sales, sale lines, change logs, subscriptions, and sale
idempotency use shop-scoped constraints and forced RLS.

Evidence:
- `app/modules/auth/dependencies.py::get_auth_context`
- `app/modules/auth/dependencies.py::get_shop_context`
- `alembic/versions/c3d4e5f6a7b8_add_saas_tenancy.py::TENANT_TABLES`
- `alembic/versions/d4e5f6a7b8c9_add_deletion_and_idempotency.py::upgrade`

### Identity, membership, and deletion

Owners register with verified email/password or Android Google ID tokens.
Staff join through hashed, expiring shop invitations. Access JWTs contain user
and session identity but no role; opaque hashed refresh tokens rotate in the
database. Roles are OWNER, ADMIN, MANAGER, and CASHIER. Confirmed account
deletions execute after 30 days and can be cancelled with the confirmation token.

Evidence:
- `app/modules/auth/security.py::create_access_token`
- `app/modules/auth/routes.py::accept_invitation`
- `app/modules/auth/routes.py::google_auth`
- `app/worker.py::process_account_deletions`

### Inventory, entitlement, and sale flow

Hosted entitlement belongs to a shop. Self-hosted shops are Pro/unlimited;
hosted shops without a current Pro subscription are limited to 50 active
inventory rows. Item activation locks the shop before counting. Sale creation
locks inventory rows, prices with `Decimal`, stores line snapshots, decrements
stock, and records a shop-scoped idempotency result.

Evidence:
- `app/modules/subscriptions/service.py::enforce_item_activation_limit`
- `app/modules/sales/routes.py::create`
- `app/modules/sales/service.py::_execute_create_sale`

### Billing and asynchronous work

The Android bridge queries and launches Play subscriptions. The API verifies
purchase tokens with Android Publisher, checks the obfuscated shop identifier,
encrypts tokens at rest, acknowledges purchases, and derives entitlements from
server state. Authenticated RTDN pushes and periodic reconciliation keep state
current. The worker also delivers the PostgreSQL email outbox through SES.

Evidence:
- `frontend/android/app/src/main/java/com/aurumpos/app/AurumBillingPlugin.java`
- `app/modules/billing/service.py::verify_play_purchase`
- `app/modules/billing/routes.py::receive_rtdn`
- `app/worker.py::run_once`

### Client boot and shop state

The React root supplies TanStack Query and shop contexts. Axios adds API prefix,
tokens, device UUID, and shop ID, and serializes refresh retries. Query keys are
shop-namespaced and switching shops clears cached server state. Official cloud
builds ignore saved URLs and use `https://api.aurumpos.net`; self-hosted builds
retain runtime API configuration.

Evidence:
- `frontend/src/main.tsx::ShopProvider`
- `frontend/src/api/client.ts::client.interceptors`
- `frontend/src/api/queryKeys.ts::queryKeys`
- `frontend/src/utils/apiConfig.ts::getApiBaseUrl`
