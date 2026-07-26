# Dependencies

### Backend runtime

Python 3.12 runs FastAPI under Uvicorn.
Pydantic Settings loads configuration; SQLAlchemy async and asyncpg access PostgreSQL.
PyJWT, Passlib, and Argon2 implement sessions/passwords.
Google Auth verifies identity and Pub/Sub OIDC tokens, cryptography encrypts Play tokens, and boto3 sends SES email and stores private invoice PDFs in S3 through the AWS credential chain.

Evidence:
- `pyproject.toml::project.dependencies`
- `app/modules/auth/security.py::pwd_context`
- `app/modules/billing/service.py::_encrypt_token`
- `app/modules/sales/storage.py::InvoiceStorage`
- `app/worker.py::deliver_email`

### Database and local service

PostgreSQL is required persistence; Alembic owns schema migrations and forced tenant RLS.
Local Compose provides PostgreSQL 16 with a named volume.

Evidence:
- `alembic/env.py::run_migrations_online`
- `compose.dev.yml::services.postgres`
- `.env.example::DATABASE_URL`

### Documents and frontend

ReportLab and OpenPyXL generate invoices and labels. React 18, React Router,
Axios, TanStack Query, Chart.js, and Tailwind implement the client. Capacitor
Preferences and Filesystem provide mobile storage and exports.

Evidence:
- `app/modules/sales/invoice.py::generate_invoice_pdf`
- `frontend/package.json::dependencies`
- `frontend/src/api/client.ts::client`

### Android, billing, and delivery

Capacitor wraps Vite assets for Android. The official client uses Google
Credential Manager and Play Billing Library 9.1.0. Docker builds a non-root,
multi-architecture API image; hosted Compose runs loopback-only API and worker
containers behind host Nginx, with Aiven PostgreSQL and an immutable image
digest.

Evidence:
- `frontend/android/app/build.gradle::dependencies`
- `frontend/capacitor.config.ts::config`
- `Dockerfile::runtime`
- `compose.cloud.yml::services`

### Verification toolchain

Ruff, Mypy, Pytest, pytest-asyncio, and pytest-cov verify Python.
ESLint, TypeScript, Vitest, Testing Library, and Vite verify the client.
CI migrates a fresh PostgreSQL service, verifies `alembic check`, and scans changed migration upgrades for unsafe schema operations before integration tests.
Android workflows use JDK 21.

Evidence:
- `pyproject.toml::dependency-groups.dev`
- `scripts/check_migration_safety.py::analyze_migration`
- `frontend/package.json::scripts`
- `.github/workflows/ci.yml::jobs`
- `.github/workflows/build-android.yml::Set up JDK 21`
