---
type: index
title: Sales Module Index
description: Routing for POS sale knowledge.
resource: .ai/knowledge/sales/INDEX.md
tags: [aurum-pos, sales, routing]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/knowledge/sales/api.md, .ai/knowledge/sales/schema.md, .ai/knowledge/sales/business_rules.md, .ai/knowledge/sales/ui.md]
---

# Sales Module Index

## Source Map

| Path | Purpose |
|---|---|
| `app/modules/sales/routes.py` | Sale endpoint |
| `app/modules/sales/service.py` | Sale transaction behavior |
| `app/modules/sales/models.py` | `sales` and `sale_items` tables |
| `app/modules/sales/schemas.py` | Sale request/response schemas |
| `frontend/src/pages/POS.tsx` | POS checkout UI |

## Task Routing

| Task | Load |
|---|---|
| Change sale endpoint | `api.md` |
| Change sale fields or migrations | `schema.md` |
| Change checkout, stock decrement, price locking, or audit behavior | `business_rules.md` |
| Change POS screen behavior | `ui.md` |
