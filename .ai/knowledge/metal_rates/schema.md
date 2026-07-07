---
type: schema
title: Metal Rates Schema
description: Metal rate database and request schemas.
resource: .ai/knowledge/metal_rates/schema.md
tags: [aurum-pos, metal_rates, schema]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/metal_rates/INDEX.md]
  related: [.ai/knowledge/metal_rates/api.md, .ai/knowledge/metal_rates/business_rules.md]
---

# Metal Rates Schema

## Table

| Table | Fields | Evidence |
|---|---|---|
| `metal_rates` | `id`, `metal` indexed, `purity` indexed, `rate_per_gram`, `effective_from` indexed, `created_at` | `app/modules/metal_rates/models.py` |

## Pydantic Models

| Model | Fields | Evidence |
|---|---|---|
| `MetalRateCreate` | `metal`, `purity`, `rate_per_gram` | `app/modules/metal_rates/schemas.py` |
