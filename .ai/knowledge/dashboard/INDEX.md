---
type: index
title: Dashboard Module Index
description: Routing for dashboard and analytics knowledge.
resource: .ai/knowledge/dashboard/INDEX.md
tags: [aurum-pos, dashboard, routing]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/knowledge/dashboard/api.md, .ai/knowledge/dashboard/schema.md, .ai/knowledge/dashboard/business_rules.md, .ai/knowledge/dashboard/ui.md]
---

# Dashboard Module Index

## Source Map

| Path | Purpose |
|---|---|
| `app/modules/dashboard/routes.py` | Dashboard endpoints |
| `app/modules/dashboard/service.py` | KPI and analytics aggregation |
| `app/modules/dashboard/schemas.py` | Analytics response models |
| `frontend/src/pages/Dashboard.tsx` | Summary UI |
| `frontend/src/pages/Analytics.tsx` | Analytics chart UI |

## Task Routing

| Task | Load |
|---|---|
| Change summary/analytics endpoints | `api.md` |
| Change analytics response shape | `schema.md` |
| Change KPI or aggregation logic | `business_rules.md` |
| Change dashboard or analytics screens | `ui.md` |
