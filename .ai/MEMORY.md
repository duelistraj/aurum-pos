# Memory

### Local bootstrap

From the repository root, copy `.env.example` to `.env`, run
`uv sync --locked`, start PostgreSQL with
`docker compose -f compose.dev.yml up -d --wait postgres`, apply migrations with
`uv run alembic upgrade head`, and start the API with
`uv run uvicorn app.main:app --reload --port 8080`. In `frontend/`, run
`npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`. Local API
development always uses port 8080; Vite strictly uses port 5174.

Evidence:
- `README.md::Local development`
- `frontend/vite.config.ts::server`

### Tenancy and distribution invariants

Clients call `/api/v1` with an access token, `X-Device-UUID`, and selected
`X-Shop-ID`. Tenant business tables use `shop_id`, shop-scoped constraints, and
forced PostgreSQL RLS. Official cloud Android builds use package
`com.duelistraj.aurumpos` and fixed API `https://api.aurumpos.net`; self-hosted
builds configure their own endpoint and are unlimited. Hosted free shops may
have at most 50 active inventory rows.
The device header must match the device bound to the authenticated session.
Hosted mode requires `ENV=production`.
Invoice numbers are assigned by the server, and invoice PDFs are produced by a durable PostgreSQL-backed worker job after sale commit.
Android auth tokens are encrypted through Android Keystore.

Evidence:
- `app/modules/auth/dependencies.py::get_shop_context`
- `app/modules/subscriptions/service.py::resolve_entitlement`
- `frontend/src/utils/apiConfig.ts::getApiBaseUrl`

### Secrets and cutover safety

Never commit `.env`, signing keys, Play service-account JSON,
billing encryption keys, access tokens, customer records, database dumps, or
item exports. BMR cutover uses a clean SaaS database and the checksummed
item-only export/import; keep the old deployment isolated for 30 days. Do not
run the SaaS reset against the live BMR database.
Official production values are individual KMS-encrypted SSM SecureStrings and are assembled into the host `.env` by the private operations deployment.
Operators do not copy production values into a local `.env`.
The migration administrator URL remains a separate parameter and is never installed in the API or worker runtime file.

Evidence:
- `SECURITY.md::Secrets`
- `README.md::BMR item-only cutover`
- `deploy/OPERATIONS.md::Current hosted configuration`

### Verification commands

Backend gates are `uv lock --check`, `uv run pip-audit`, Ruff check/format across source and migrations, `uv run mypy app`, and `uv run pytest`.
Migration verification runs `alembic upgrade head` followed by `alembic check` against an isolated PostgreSQL database.
Frontend gates are lint, typecheck, Vitest, and production build.
PostgreSQL integration tests require `RUN_INTEGRATION=1` and a migrated isolated database.

Evidence:
- `.github/workflows/ci.yml::jobs`
- `tests/test_integration_flow.py::pytestmark`
