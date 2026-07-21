# Dependencies

### Backend runtime

Python 3.12 runs FastAPI under Uvicorn. Pydantic Settings loads environment
configuration; SQLAlchemy's async API and asyncpg implement PostgreSQL access;
PyJWT and Passlib with Argon2 implement tokens and password hashing.

Evidence:
- `pyproject.toml::project.requires-python`
- `pyproject.toml::project.dependencies`
- `app/core/config.py::Settings`
- `app/core/database.py::engine`
- `app/modules/auth/security.py::pwd_context`

### Database schema and local service

PostgreSQL is the required persistent service. Alembic owns schema migrations,
and the local development Compose file provides PostgreSQL 16 with a health
check and named data volume.

Evidence:
- `alembic.ini::alembic`
- `alembic/env.py::run_migrations_online`
- `compose.dev.yml::services.postgres`
- `.env.example::DATABASE_URL`

### Document generation

ReportLab and its Code128 support generate invoice and label PDFs; OpenPyXL
generates spreadsheet labels.

Evidence:
- `pyproject.toml::project.dependencies`
- `app/modules/sales/invoice.py::generate_invoice_pdf`
- `app/utils/label.py::generate_batch_labels_pdf`
- `app/utils/label.py::generate_batch_labels_xlsx`

### Frontend runtime

React 18 and React Router provide the SPA and navigation. Axios implements API
transport, TanStack Query manages cached server state, Chart.js renders
analytics, Tailwind supplies styling, and Capacitor plugins expose mobile
storage and device integrations.

Evidence:
- `frontend/package.json::dependencies`
- `frontend/src/App.tsx::Routes`
- `frontend/src/api/client.ts::client`
- `frontend/src/api/queryClient.ts::queryClient`
- `frontend/src/utils/storage.ts::getPreference`

### Client platforms and delivery

Vite builds the shared web assets. Capacitor wraps `dist` for Android, while
Tauri embeds the same frontend for desktop packaging. Docker builds a non-root
API image; the production Compose example combines that image with Nginx and
Certbot, and GitHub Actions publishes multi-architecture GHCR images.

Evidence:
- `frontend/package.json::scripts.build`
- `frontend/capacitor.config.ts::config`
- `frontend/src-tauri/tauri.conf.json::build`
- `Dockerfile::runtime`
- `docker-compose.yml::services`
- `.github/workflows/docker-publish.yml::docker`

### Verification toolchain

Ruff, Mypy, Pytest, pytest-asyncio, and pytest-cov verify the backend. ESLint,
TypeScript, Vitest, Testing Library, and the Vite production build verify the
frontend. CI runs migrations and both verification suites against PostgreSQL.

Evidence:
- `pyproject.toml::dependency-groups.dev`
- `pyproject.toml::tool.pytest.ini_options`
- `frontend/package.json::scripts`
- `frontend/package.json::devDependencies`
- `.github/workflows/ci.yml::jobs`
