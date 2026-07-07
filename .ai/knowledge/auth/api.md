---
type: api
title: Auth API
description: Auth endpoint contracts.
resource: .ai/knowledge/auth/api.md
tags: [aurum-pos, auth, api]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/auth/INDEX.md]
  related: [.ai/knowledge/auth/schema.md, .ai/knowledge/auth/business_rules.md, .ai/knowledge/auth/ui.md]
---

# Auth API

## Routes

| Method | Path | Response | Notes | Evidence |
|---|---|---|---|---|
| POST | `/auth/login` | `TokenResponse` | Public route. | `app/modules/auth/routes.py` |
| POST | `/auth/refresh` | `TokenResponse` | Public route using refresh token payload. | `app/modules/auth/routes.py` |
| POST | `/auth/logout` | `{"message": "Logged out successfully"}` | Public route. | `app/modules/auth/routes.py` |
| GET | `/auth/devices` | `list[DeviceResponse]` | Requires `RequireAdmin`. | `app/modules/auth/routes.py` |
| PATCH | `/auth/devices/{device_id}` | `DeviceResponse` | Requires `RequireAdmin`; updates `is_active`. | `app/modules/auth/routes.py` |
| POST | `/auth/verify-manager-password` | `{"valid": bool}` | Compares request password to settings manager password. | `app/modules/auth/routes.py` |

## Client Calls

- `apiClient.login`, `logout`, and `verifyManagerPassword` wrap auth endpoints. Evidence: `frontend/src/api/client.ts`.
- Axios request interceptor attaches `Authorization: Bearer <token>` and `X-Device-UUID`. Evidence: `frontend/src/api/client.ts`.
- 401 responses trigger refresh via `/auth/refresh` except for `/auth/login`. Evidence: `frontend/src/api/client.ts`.
