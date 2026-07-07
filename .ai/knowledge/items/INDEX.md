---
type: index
title: Items Module Index
description: Routing for inventory item knowledge.
resource: .ai/knowledge/items/INDEX.md
tags: [aurum-pos, items, routing]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/knowledge/items/api.md, .ai/knowledge/items/schema.md, .ai/knowledge/items/business_rules.md, .ai/knowledge/items/ui.md]
---

# Items Module Index

## Source Map

| Path | Purpose |
|---|---|
| `app/modules/items/routes.py` | Inventory, scan, summary, label endpoints |
| `app/modules/items/service.py` | CRUD, search, pagination, summaries |
| `app/modules/items/models.py` | `items` table |
| `app/modules/items/schemas.py` | Item request/response models |
| `app/modules/items/pricing.py`, `app/modules/items/tax.py` | Pricing and tax helpers |
| `app/utils/label.py` | Label/export generation helper |
| `frontend/src/pages/Items.tsx` | Inventory UI |

## Task Routing

| Task | Load |
|---|---|
| Endpoint or API client changes | `api.md` |
| Item fields, validation, migrations | `schema.md` |
| Barcode, stock, pricing, labels, tax, edit/delete rules | `business_rules.md` |
| Inventory page behavior | `ui.md` |
