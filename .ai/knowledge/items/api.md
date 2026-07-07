---
type: api
title: Items API
description: Inventory endpoint contracts.
resource: .ai/knowledge/items/api.md
tags: [aurum-pos, items, api]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/items/INDEX.md]
  related: [.ai/knowledge/items/schema.md, .ai/knowledge/items/business_rules.md, .ai/knowledge/items/ui.md]
---

# Items API

## Routes

| Method | Path | Response | Evidence |
|---|---|---|---|
| POST | `/items/` | `ItemOut` | `app/modules/items/routes.py` |
| GET | `/items/` | `ItemPaginationOut` | `app/modules/items/routes.py` |
| GET | `/items/summary` | summary dict | `app/modules/items/routes.py`; `app/modules/items/service.py` |
| GET | `/items/barcode/{barcode}` | `ItemOut` | `app/modules/items/routes.py` |
| GET | `/items/latest` | `ItemOut` | `app/modules/items/routes.py` |
| GET | `/items/{item_id}` | `ItemOut` | `app/modules/items/routes.py` |
| PATCH | `/items/{item_id}` | `ItemOut` | `app/modules/items/routes.py` |
| DELETE | `/items/{item_id}` | 204 | `app/modules/items/routes.py` |
| GET | `/items/pos/scan/{barcode}` | `ItemPOSWithPrice` | `app/modules/items/routes.py` |
| POST | `/items/labels/batch` | XLSX or PDF bytes | `app/modules/items/routes.py` |
| GET | `/items/labels/all` | label export bytes | `app/modules/items/routes.py` |

## Query and Client Signals

- List accepts `page`, `limit`, `search`, `category`, and `status` query parameters. Evidence: `app/modules/items/routes.py`; `frontend/src/api/client.ts`.
- POS scan route returns item data plus `pricing`. Evidence: `app/modules/items/routes.py`; `app/modules/items/schemas.py`.
- Batch labels accept item IDs in request body and `format` query parameter. Evidence: `app/modules/items/routes.py`; `frontend/src/api/client.ts`.
