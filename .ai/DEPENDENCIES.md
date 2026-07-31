# Dependencies

### Backend runtime

Python 3.12 runs FastAPI under Uvicorn.
Pydantic Settings loads configuration; SQLAlchemy async and asyncpg access PostgreSQL.
PyJWT and Argon2 implement sessions/passwords.
Google Auth verifies identity and Pub/Sub OIDC tokens, cryptography encrypts Play tokens, and boto3 sends SES email and stores private invoice PDFs in S3 through the AWS credential chain.

Evidence:
- `pyproject.toml::project.dependencies`
- `app/modules/auth/security.py::password_hasher`
- `app/modules/billing/service.py::_encrypt_token`
- `app/modules/sales/storage.py::InvoiceStorage`
- `app/jobs/emails.py::deliver_email`

### Database and local service

PostgreSQL is required persistence; Alembic owns schema migrations and forced tenant RLS.
Local Compose provides PostgreSQL 16 with a named volume.

Evidence:
- `alembic/env.py::run_migrations_online`
- `compose.dev.yml::services.postgres`
- `.env.example::DATABASE_URL`

### Documents and frontend

ReportLab and OpenPyXL generate invoices and labels. React 18, React Router,
Axios, TanStack Query, Chart.js, and Tailwind implement the client.
Capacitor Preferences stores non-secret native client state, Filesystem provides native exports, and a native Android Keystore plugin encrypts access and refresh tokens.
Browser access tokens are memory-only, and local storage contains only non-secret preferences and an untrusted installation UUID.

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
Node.js 24.18.0 and npm 11.16.0 provide the pinned frontend toolchain.
ESLint, TypeScript, Vitest, Testing Library, Vite, and Playwright verify the client.
CI migrates a fresh PostgreSQL service, verifies `alembic check`, and scans changed migration upgrades for unsafe schema operations before integration tests.
Android workflows use JDK 21, and signed releases run Gradle unit tests and lint before bundling.

Evidence:
- `pyproject.toml::dependency-groups.dev`
- `scripts/check_migration_safety.py::analyze_migration`
- `frontend/package.json::scripts`
- `.github/workflows/ci.yml::jobs`
- `.github/workflows/build-android.yml::Set up JDK 21`
