---
type: glossary
title: Glossary
description: Shared domain terms used across aurum-pos.
resource: .ai/knowledge/glossary.md
tags: [aurum-pos, glossary, shared]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/knowledge/INDEX.md]
---

# Glossary

| Term | Meaning | Evidence |
|---|---|---|
| Item | Inventory catalog record in `items` table. | `app/modules/items/models.py` |
| Barcode | Unique indexed item lookup value; generated as 8 digits when omitted on create. | `app/modules/items/models.py`; `app/modules/items/service.py` |
| Unique item | Category that forces `net_weight` to `0` and uses making charge as price basis. | `app/modules/items/schemas.py`; `app/modules/items/pricing.py` |
| Metal rate | Rate per gram by metal and purity. | `app/modules/metal_rates/models.py` |
| Sale item | Join row between sale and item; stores quantity, price, and locked price breakdown. | `app/modules/sales/models.py` |
| Change log | Audit row with entity, entity id, action, JSON payload, and created timestamp. | `app/core/changelog/models.py` |
| Manager password | Secondary shared secret checked by `/auth/verify-manager-password`. | `app/core/config.py`; `app/modules/auth/routes.py` |
| Device UUID | Client device identifier sent as `X-Device-UUID`. | `frontend/src/api/client.ts`; `app/modules/auth/dependencies.py` |
