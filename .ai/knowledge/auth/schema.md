---
type: schema
title: Auth Schema
description: Auth database models and Pydantic schemas.
resource: .ai/knowledge/auth/schema.md
tags: [aurum-pos, auth, schema]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/auth/INDEX.md]
  related: [.ai/knowledge/auth/api.md, .ai/knowledge/auth/business_rules.md]
---

# Auth Schema

## Tables

| Table | Fields | Evidence |
|---|---|---|
| `users` | `id`, `username` unique indexed, `password_hash`, `full_name`, `role`, `is_active`, `created_at`, `updated_at` | `app/modules/auth/models.py` |
| `devices` | `id`, `device_uuid` unique indexed, `device_name`, `platform`, `app_version`, `is_active`, `registered_by_user_id`, `registered_at`, `last_seen` | `app/modules/auth/models.py` |

## Relationships

- `User.devices` cascades delete-orphan to `Device`. Evidence: `app/modules/auth/models.py`.
- `Device.registered_by_user_id` references `users.id`. Evidence: `app/modules/auth/models.py`.

## Pydantic Models

| Model | Fields | Evidence |
|---|---|---|
| `LoginRequest` | `username`, `password`, `device_uuid`, `device_name`, `platform`, `app_version` | `app/modules/auth/schemas.py` |
| `TokenResponse` | `access_token`, `refresh_token`, `token_type`, `role`, `full_name`, `user_id` | `app/modules/auth/schemas.py` |
| `RefreshRequest` | `refresh_token` | `app/modules/auth/schemas.py` |
| `UserResponse` | user id/name/role/active/timestamps | `app/modules/auth/schemas.py` |
| `DeviceResponse` | device id/identity/platform/version/active/timestamps/registrar | `app/modules/auth/schemas.py` |
| `DeviceUpdate` | `is_active` | `app/modules/auth/schemas.py` |
| `VerifyManagerPasswordRequest` | `password` | `app/modules/auth/schemas.py` |
