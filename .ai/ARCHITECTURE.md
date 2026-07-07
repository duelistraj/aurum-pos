---
type: architecture
title: Repository Architecture
description: Path ownership and module map for aurum-pos.
resource: .ai/ARCHITECTURE.md
tags: [aurum-pos, architecture, routing]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/INDEX.md]
  related: [.ai/knowledge/dependencies.md]
---

# Architecture

## Source Roots

| Path | Ownership |
|---|---|
| `app/main.py` | FastAPI app assembly, CORS, router registration, health endpoint |
| `app/core/` | Settings, database session/base, shared changelog model/service |
| `app/modules/auth/` | Auth, JWT security, device registration, role/device dependencies |
| `app/modules/items/` | Inventory catalog, pricing helpers, tax profile, label exports |
| `app/modules/metal_rates/` | Metal rate records and lookup services |
| `app/modules/sales/` | Sale creation, sale item persistence, stock decrement, price lock |
| `app/modules/invoices/` | Invoice PDF generation and invoice download route |
| `app/modules/dashboard/` | Dashboard summary and analytics aggregation |
| `app/modules/changelog/` | Audit/history query API over shared `change_log` table |
| `alembic/` | Database migration environment and revisions |
| `frontend/src/api/` | Axios client and endpoint wrappers |
| `frontend/src/pages/` | React screens routed in `frontend/src/App.tsx` |
| `frontend/src/components/` | Shared navigation/header/UI components |
| `frontend/src/context/` | App config and theme context |
| `frontend/src/utils*` | Auth/device storage and file download helpers |
| `frontend/android/` | Capacitor Android project |
| `frontend/src-tauri/` | Tauri desktop shell |
| `nginx/` | Reverse proxy configuration |
| `.github/workflows/` | Generic CI, Docker image, Android debug APK, and optional signed Android AAB workflows |

## Runtime Shape

- `app/main.py` creates `FastAPI(title=settings.app_name, version="0.1.0")`.
- CORS origins come from `settings.cors_origins`, with localhost Vite/preview, HTTPS localhost, and Capacitor localhost defaults.
- `auth_router` is included without global auth dependency.
- Item, sale, metal rate, dashboard, changelog, and invoice routers are included with `RequireAuth`.
- SQLAlchemy async engine is created from `settings.database_url` and disposed in lifespan shutdown.
