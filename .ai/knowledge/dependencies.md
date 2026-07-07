---
type: dependencies
title: Dependencies and Tooling
description: Repository-wide dependencies, commands, environment keys, and deployment facts.
resource: .ai/knowledge/dependencies.md
tags: [aurum-pos, dependencies, tooling]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/MEMORY.md, .ai/ARCHITECTURE.md]
---

# Dependencies and Tooling

## Backend

| Area | Facts | Evidence |
|---|---|---|
| Python | Poetry project uses Python `~3.12`. | `pyproject.toml` |
| API | FastAPI, Uvicorn standard. | `pyproject.toml` |
| Database | SQLAlchemy 2 async, asyncpg, Alembic. | `pyproject.toml`; `app/core/database.py` |
| Settings | Pydantic settings reads `.env`, ignores extra keys, and exposes env-driven `cors_origins`. | `app/core/config.py` |
| PDF/barcode/export | reportlab, python-barcode, pillow, openpyxl. | `pyproject.toml`; `app/modules/invoices/pdf.py`; `app/modules/items/routes.py` |
| Auth | PyJWT, passlib[argon2], argon2-cffi, python-multipart. | `pyproject.toml`; `app/modules/auth/security.py` |

## Frontend

| Area | Facts | Evidence |
|---|---|---|
| App | React 18, React DOM, TypeScript, Vite. | `frontend/package.json` |
| Routing/API | react-router-dom v6, axios. | `frontend/package.json`; `frontend/src/App.tsx`; `frontend/src/api/client.ts` |
| UI | Tailwind CSS, lucide-react, Chart.js, react-chartjs-2, date-fns. | `frontend/package.json`; `frontend/src/pages/Analytics.tsx` |
| Mobile | Capacitor core/android/filesystem/local-notifications/preferences/share. | `frontend/package.json`; `frontend/capacitor.config.ts`; `frontend/src/utils.ts` |
| Desktop shell | Tauri v2 Rust project exists under `frontend/src-tauri/`. | `frontend/src-tauri/Cargo.toml` |

## Environment Keys

| Key | Used by | Evidence |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy engine. | `.env.example`; `app/core/config.py` |
| `APP_NAME` | FastAPI title and frontend app name fetch. | `.env.example`; `app/core/config.py`; `frontend/src/context/ConfigContext.tsx` |
| `JWT_SECRET_KEY` | JWT signing/decoding. | `.env.example`; `app/core/config.py`; `app/modules/auth/security.py` |
| `MANAGER_PASSWORD` | Manager verification endpoint. | `.env.example`; `app/core/config.py`; `app/modules/auth/routes.py` |
| `CORS_ORIGINS` | Backend CORS allowlist. | `.env.example`; `app/core/config.py`; `app/main.py` |
| `VITE_API_URL` | Optional build-time default API URL; runtime saved API URL can override it. | `README.md`; `frontend/.env.example`; `frontend/src/utils/apiConfig.ts`; `frontend/src/api/client.ts` |

## Deployment

| Fact | Evidence |
|---|---|
| Dockerfile builds Python 3.12 slim with Poetry 2.1.4, installs main deps only, runs as non-root `appuser`, and starts Uvicorn on port 8000. | `Dockerfile` |
| Compose runs `nginx`, `certbot`, and `api`; sample API image is `ghcr.io/your-org/aurum-pos:latest`; healthcheck calls `/`. | `docker-compose.yml` |
| Public workflows exist for generic CI, Docker image publish, Android debug APK artifact, and optional signed AAB artifact when signing secrets are configured. | `.github/workflows/ci.yml`; `.github/workflows/docker-publish.yml`; `.github/workflows/build-android.yml`; `.github/workflows/android-release.yml` |
