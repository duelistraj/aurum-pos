# Aurum POS

Aurum POS is an open-source point-of-sale and inventory system for jewellery
shops. It includes a FastAPI backend, PostgreSQL migrations, a React web app,
and a generic Capacitor Android app.

## Features

- Barcode-assisted POS checkout and invoice PDF generation.
- Jewellery inventory with metal, purity, weight, GST, HSN, and stock tracking.
- Metal rate management for gold, silver, platinum, and custom purities.
- Dashboard, analytics, and audit history.
- JWT authentication, device registration, and manager-password checks.
- Runtime backend URL setup in the web and Android app.

## Architecture

- Backend: FastAPI, async SQLAlchemy, Alembic, PostgreSQL.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS.
- Mobile: Capacitor Android wrapping the same frontend bundle.
- Deployment: Docker image and example Nginx reverse proxy.

## Backend Setup

```bash
uv sync --locked
cp .env.example .env
docker compose -f compose.dev.yml up -d --wait postgres
uv run alembic upgrade head
uv run python -m app.cli admin strong-password "Admin User"
uv run uvicorn app.main:app --reload --port 8080
```

Edit `.env` before running in production. At minimum set `DATABASE_URL`,
`JWT_SECRET_KEY`, `MANAGER_PASSWORD`, `APP_NAME`, and `CORS_ORIGINS`.

The backend runs at `http://localhost:8080` in local development. Swagger docs
are at `http://localhost:8080/docs`.

## Frontend Setup

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

The frontend runs at `http://localhost:5174`. Vite uses a strict port setting,
so it fails instead of silently selecting another port when 5174 is occupied.

`VITE_API_URL` is optional. Leave it blank for generic builds; the app will ask
for the backend API URL on first launch and store it on the device.

## Android Builds

Debug APK:

```bash
cd frontend
npm run build
npx cap sync
cd android
./gradlew assembleDebug
```

The debug APK is written to
`frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

For Play Store distribution, publish one generic signed AAB from your maintainer
Play Console. Shops install the app and enter their own backend API URL.

For a shop-branded Play listing, fork this repository, change the Capacitor
`appId`, Android `namespace` and `applicationId`, app name, icons, and signing
key, then build and upload the signed AAB from that shop's Play Console.

Users who do not need the Play Store can sideload an APK built from their fork
or from a trusted release artifact.

## Docker

The public workflow builds and publishes a generic GHCR image. It does not
deploy to any production cloud account, server, or domain. Keep shop-specific
deployment automation in a private deployment repository.

Update `docker-compose.yml` and `nginx/default.conf` with your own image name,
domain, certificates, and environment file before production use.

## Repository Hygiene

Do not commit `.env`, Android keystores, Play signing keys, production domains,
database dumps, customer data, invoice PDFs, or access tokens. Run a secret scan
before making a fork or deployment repo public.
