---
type: decision-log
title: Decision Log
description: Source-backed architectural decisions and open decision placeholders.
resource: .ai/knowledge/decision_log.md
tags: [aurum-pos, decisions, shared]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/ARCHITECTURE.md]
---

# Decision Log

| Decision | Status | Evidence |
|---|---|---|
| Use FastAPI with async SQLAlchemy and asyncpg for backend persistence. | verified | `pyproject.toml`; `app/core/database.py`; `app/main.py` |
| Protect all non-auth routers through `RequireAuth` at router include time. | verified | `app/main.py` |
| Store auth tokens and device UUID in Capacitor Preferences on the frontend. | verified | `frontend/src/utils/auth.ts`; `frontend/src/utils/device.ts` |
| Use Capacitor Android with app id `com.bmr.chandiwala`. | verified | `frontend/capacitor.config.ts` |
| Docker runtime uses non-root `appuser`. | verified | `Dockerfile` |

## TODO

- No explicit ADR files were found. Add decision entries only when backed by source, README, or committed docs.
