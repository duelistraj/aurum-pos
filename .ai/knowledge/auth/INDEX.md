---
type: index
title: Auth Module Index
description: Routing for authentication, device, and authorization knowledge.
resource: .ai/knowledge/auth/INDEX.md
tags: [aurum-pos, auth, routing]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/knowledge/auth/api.md, .ai/knowledge/auth/schema.md, .ai/knowledge/auth/business_rules.md, .ai/knowledge/auth/ui.md]
---

# Auth Module Index

## Source Map

| Path | Purpose |
|---|---|
| `app/modules/auth/routes.py` | Auth endpoints |
| `app/modules/auth/service.py` | Login and refresh behavior |
| `app/modules/auth/dependencies.py` | Current user/device and role guards |
| `app/modules/auth/security.py` | Password hashing and JWT helpers |
| `app/modules/auth/models.py` | `users` and `devices` tables |
| `frontend/src/pages/Login.tsx` | Login screen |
| `frontend/src/utils/auth.ts`, `frontend/src/utils/device.ts` | Token and device storage |

## Task Routing

| Task | Load |
|---|---|
| Change auth endpoints | `api.md` |
| Change user/device tables or token response schemas | `schema.md` |
| Change login, refresh, password, device, role, or manager rules | `business_rules.md` |
| Change login screen, token storage, device UUID, or auth client behavior | `ui.md` |
