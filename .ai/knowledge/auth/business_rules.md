---
type: business-rules
title: Auth Business Rules
description: Auth, device, role, and token behavior.
resource: .ai/knowledge/auth/business_rules.md
tags: [aurum-pos, auth, rules]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/auth/INDEX.md]
  related: [.ai/knowledge/auth/api.md, .ai/knowledge/auth/schema.md]
---

# Auth Business Rules

## Verified Facts

- Passwords are verified and hashed through passlib Argon2 context. Evidence: `app/modules/auth/security.py`.
- JWT access tokens include subject and role; refresh tokens include subject and `type: refresh`. Evidence: `app/modules/auth/security.py`.
- Login rejects invalid credentials with 401 and inactive users with 403. Evidence: `app/modules/auth/service.py`.
- Login registers a new device for the user when `device_uuid` is unknown; disabled known devices are rejected. Evidence: `app/modules/auth/service.py`.
- Refresh rejects invalid refresh tokens with 401 and inactive/missing users with 403. Evidence: `app/modules/auth/service.py`.
- `get_current_user` decodes bearer token and rejects inactive users. Evidence: `app/modules/auth/dependencies.py`.
- `get_current_device` requires `X-Device-UUID`, checks registration, checks active flag, and updates `last_seen`. Evidence: `app/modules/auth/dependencies.py`.
- Role guard factory `require_role` checks `user.role` against allowed roles; `RequireAdmin` is admin-only. Evidence: `app/modules/auth/dependencies.py`.
- Manager password verification trims request and settings values before comparing. Evidence: `app/modules/auth/routes.py`; `app/core/config.py`.
