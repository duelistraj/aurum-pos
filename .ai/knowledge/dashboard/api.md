---
type: api
title: Dashboard API
description: Dashboard endpoint contracts.
resource: .ai/knowledge/dashboard/api.md
tags: [aurum-pos, dashboard, api]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/dashboard/INDEX.md]
  related: [.ai/knowledge/dashboard/schema.md, .ai/knowledge/dashboard/business_rules.md]
---

# Dashboard API

## Routes

| Method | Path | Response | Evidence |
|---|---|---|---|
| GET | `/dashboard/summary` | summary dict | `app/modules/dashboard/routes.py`; `app/modules/dashboard/service.py` |
| GET | `/dashboard/analytics` | `AnalyticsDashboardResponse` | `app/modules/dashboard/routes.py`; `app/modules/dashboard/schemas.py` |

## Query Parameters

- Analytics accepts `from_date`, `to_date`, and `metal`. Evidence: `app/modules/dashboard/routes.py`; `frontend/src/api/client.ts`.
