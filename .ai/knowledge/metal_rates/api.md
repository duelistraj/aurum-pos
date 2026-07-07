---
type: api
title: Metal Rates API
description: Metal rate endpoint contracts.
resource: .ai/knowledge/metal_rates/api.md
tags: [aurum-pos, metal_rates, api]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/metal_rates/INDEX.md]
  related: [.ai/knowledge/metal_rates/schema.md, .ai/knowledge/metal_rates/business_rules.md]
---

# Metal Rates API

## Routes

| Method | Path | Response | Evidence |
|---|---|---|---|
| GET | `/metal-rates` | list of metal rate rows | `app/modules/metal_rates/routes.py` |
| GET | `/metal-rates/available` | `dict[str, list[float]]` | `app/modules/metal_rates/routes.py` |
| POST | `/metal-rates/` | created metal rate row | `app/modules/metal_rates/routes.py` |

## Client Calls

- `apiClient.getAvailableMetals`, `getAllMetalRates`, and `addMetalRate` wrap these endpoints. Evidence: `frontend/src/api/client.ts`.
