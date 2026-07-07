---
type: memory
title: Repository Memory
description: Stable repository-wide facts for aurum-pos.
resource: .ai/MEMORY.md
tags: [aurum-pos, memory, shared]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/ARCHITECTURE.md, .ai/knowledge/dependencies.md]
---

# Repository Memory

## Stable Facts

| Fact | Evidence |
|---|---|
| Project package name is `aurum-pos`; Python package version is `0.0.2`. | `pyproject.toml` |
| Backend is FastAPI using async SQLAlchemy and PostgreSQL via `asyncpg`. | `pyproject.toml`; `app/core/database.py` |
| Frontend is React 18 + TypeScript + Vite with Capacitor Android support and a Tauri shell present. | `frontend/package.json`; `frontend/capacitor.config.ts`; `frontend/src-tauri/Cargo.toml` |
| Domain backend modules live under `app/modules/`. | `app/modules/*` |
| Protected API routers use `RequireAuth`; `/auth/*` and `/` health are public in `app/main.py`. | `app/main.py` |
| Database migrations are Alembic revisions under `alembic/versions/`. | `alembic/versions/*` |

## Common Commands

| Task | Command | Evidence |
|---|---|---|
| Install backend dependencies | `poetry install` | `README.md`; `pyproject.toml` |
| Run migrations | `poetry run alembic upgrade head` | `README.md`; `alembic.ini` |
| Run backend dev server | `poetry run uvicorn app.main:app --reload` | `README.md`; `app/main.py` |
| Install frontend dependencies | `npm install` in `frontend/` | `README.md`; `frontend/package.json` |
| Run frontend dev server | `npm run dev` in `frontend/` | `frontend/package.json` |
| Build frontend | `npm run build` in `frontend/` | `frontend/package.json` |

## Caution

- `.env` exists locally and may contain secrets; use `.env.example` for documented keys.
