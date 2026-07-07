---
type: schema
title: Dashboard Schema
description: Dashboard response schemas.
resource: .ai/knowledge/dashboard/schema.md
tags: [aurum-pos, dashboard, schema]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/dashboard/INDEX.md]
  related: [.ai/knowledge/dashboard/api.md, .ai/knowledge/items/schema.md, .ai/knowledge/sales/schema.md]
---

# Dashboard Schema

## Pydantic Models

| Model | Fields | Evidence |
|---|---|---|
| `SalesOverviewPoint` | `date`, `total_amount` | `app/modules/dashboard/schemas.py` |
| `CategoryShare` | `category`, `sales_value`, `share` | `app/modules/dashboard/schemas.py` |
| `InventoryRatio` | in-stock/sold counts and percentages plus total count | `app/modules/dashboard/schemas.py` |
| `TrendPeriodValue` | `period`, `sales_value` | `app/modules/dashboard/schemas.py` |
| `SalesTrendCompare` | `current`, `previous` | `app/modules/dashboard/schemas.py` |
| `AnalyticsDashboardResponse` | sales, sale value, inventory, silver rate, stock value KPIs plus charts/breakdowns | `app/modules/dashboard/schemas.py` |

## Local Tables

- No dashboard-specific SQLAlchemy table exists; services aggregate item, sale, sale item, and metal rate data. Evidence: `app/modules/dashboard/service.py`.
