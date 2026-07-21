# Architecture

### System shape

Aurum POS has a FastAPI backend, an async PostgreSQL persistence layer, and a
React single-page client. The same frontend build feeds the web app and
Capacitor Android; a Tauri wrapper is also present. Production examples place
the API behind Nginx, while the development Compose file supplies PostgreSQL.

Evidence:
- `README.md::Architecture`
- `app/main.py::app`
- `frontend/capacitor.config.ts::config`
- `frontend/src-tauri/tauri.conf.json::build`
- `compose.dev.yml::services.postgres`
- `docker-compose.yml::services`

### Backend boundaries and transaction lifecycle

`app.main` mounts public authentication and health endpoints, then applies
device-aware authentication to the items, sales, metal-rate, dashboard, and
change-log routers. Each request-scoped database session runs inside one async
transaction; services flush changes and the dependency commits or rolls back
the request as a unit.

Evidence:
- `app/main.py::protected_dependencies`
- `app/core/database.py::get_db`
- `app/modules/auth/dependencies.py::RoleChecker`
- `tests/test_app_contracts.py::test_health_and_manager_verification`

### Authentication and device flow

Users authenticate with an Argon2 password hash. Login registers or refreshes
a device record and returns JWT access and refresh tokens. Protected requests
must carry both a valid access token and the registered `X-Device-UUID`; role
checkers then restrict administrative operations.

Evidence:
- `app/modules/auth/service.py::authenticate_user`
- `app/modules/auth/security.py::create_access_token`
- `app/modules/auth/dependencies.py::get_current_device`
- `app/modules/auth/dependencies.py::RequireAdmin`

### Inventory, pricing, and sale flow

Inventory items carry SKU, generated unique barcode, category, metal, purity,
weight, making charge, quantity, and stock status. POS lookup combines an
in-stock item with its applicable metal rate. Sale creation locks selected item
rows, validates stock, calculates money with `Decimal`, stores a line-level
price breakdown, decrements quantity, and marks exhausted items sold within the
request transaction.

Evidence:
- `app/modules/items/models.py::Item`
- `app/modules/items/routes.py::pos_scan`
- `app/modules/items/pricing.py::lock_price_at_sale`
- `app/modules/sales/service.py::_execute_create_sale`
- `tests/test_integration_flow.py::test_authenticated_inventory_sale_and_invoice_flow`

### Documents, analytics, and audit history

The backend generates item labels as PDF or XLSX and invoices as PDF from the
sale's stored price breakdown. Dashboard services aggregate current inventory,
sales, category, metal, and time-period data. Mutating domain services append
change-log entries that the history API filters for the client.

Evidence:
- `app/utils/label.py::generate_batch_labels_xlsx`
- `app/modules/sales/invoice.py::generate_invoice_pdf`
- `app/modules/dashboard/service.py::get_dashboard_analytics`
- `app/core/changelog/service.py::log_change`
- `app/modules/changelog/service.py::get_change_log_history`
- `tests/test_documents.py::test_invoice_is_generated_from_locked_sale_values`

### Frontend boot, data, and storage flow

The React root supplies a shared TanStack Query client. Startup resolves the
configured API URL before rendering lazy-loaded routes; protected routes check
stored authentication. Axios adds the API base URL, access token, and device
UUID to requests and serializes refresh-token retries. Versioned storage uses
Capacitor Preferences with localStorage fallback and migrates legacy keys.

Evidence:
- `frontend/src/main.tsx::QueryClientProvider`
- `frontend/src/App.tsx::App`
- `frontend/src/api/queryClient.ts::queryClient`
- `frontend/src/api/client.ts::client.interceptors`
- `frontend/src/utils/apiConfig.ts::getApiBaseUrl`
- `frontend/src/utils/storage.ts::getPreference`
