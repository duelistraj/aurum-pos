# Memory

### Local bootstrap

From the repository root, copy `.env.example` to `.env`, run
`uv sync --locked`, start PostgreSQL with
`docker compose -f compose.dev.yml up -d --wait postgres`, apply migrations with
`uv run alembic upgrade head`, and start the API with
`uv run uvicorn app.main:app --reload --port 8080`. Local API development always
uses port 8080. In
`frontend/`, run `npm ci`, copy `.env.example` to `.env.local`, and run
`npm run dev`; Vite strictly uses port 5174 and does not fall back to another
port.

Evidence:
- `README.md::Backend Setup`
- `README.md::Frontend Setup`
- `frontend/vite.config.ts::server.port`

### Required configuration and secret hygiene

The backend cannot initialize without `DATABASE_URL` and `JWT_SECRET_KEY`.
Production also needs a strong manager password and appropriate CORS origins.
Never commit `.env`, signing keys, access tokens, customer records, database
dumps, or generated invoices.

Evidence:
- `app/core/config.py::Settings`
- `.env.example::JWT_SECRET_KEY`
- `SECURITY.md::Secrets`

### Verification commands

Backend gates are `uv lock --check`, Ruff check and format check over `app tests`,
`uv run mypy app`, and `uv run pytest`. Frontend gates are `npm run lint`,
`npm run typecheck`, `npm test`, and `npm run build`. The PostgreSQL integration
test runs only when `RUN_INTEGRATION=1` against a migrated database.

Evidence:
- `.github/workflows/ci.yml::jobs.backend`
- `.github/workflows/ci.yml::jobs.frontend`
- `tests/test_integration_flow.py::pytestmark`
