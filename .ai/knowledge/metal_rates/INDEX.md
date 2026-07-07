---
type: index
title: Metal Rates Module Index
description: Routing for metal rate knowledge.
resource: .ai/knowledge/metal_rates/INDEX.md
tags: [aurum-pos, metal_rates, routing]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/knowledge/metal_rates/api.md, .ai/knowledge/metal_rates/schema.md, .ai/knowledge/metal_rates/business_rules.md, .ai/knowledge/metal_rates/ui.md]
---

# Metal Rates Module Index

## Source Map

| Path | Purpose |
|---|---|
| `app/modules/metal_rates/routes.py` | Rate endpoints |
| `app/modules/metal_rates/service.py` | Rate creation and lookup |
| `app/modules/metal_rates/models.py` | `metal_rates` table |
| `app/modules/metal_rates/schemas.py` | Create schema |
| `frontend/src/pages/MetalRates.tsx` | Rate management UI |

## Task Routing

| Task | Load |
|---|---|
| Change rate endpoints | `api.md` |
| Change rate fields or migrations | `schema.md` |
| Change rate lookup, latest rate, or purity rules | `business_rules.md` |
| Change rate management screen | `ui.md` |
