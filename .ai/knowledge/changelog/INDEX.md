---
type: index
title: Changelog Module Index
description: Routing for audit history knowledge.
resource: .ai/knowledge/changelog/INDEX.md
tags: [aurum-pos, changelog, routing]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/knowledge/changelog/api.md, .ai/knowledge/changelog/schema.md, .ai/knowledge/changelog/business_rules.md, .ai/knowledge/changelog/ui.md]
---

# Changelog Module Index

## Source Map

| Path | Purpose |
|---|---|
| `app/core/changelog/models.py` | `change_log` table |
| `app/core/changelog/service.py` | Shared write helper |
| `app/modules/changelog/routes.py` | History endpoint |
| `app/modules/changelog/service.py` | History query filters |
| `app/modules/changelog/schemas.py` | History response schema |
| `frontend/src/pages/History.tsx` | Audit history UI |

## Task Routing

| Task | Load |
|---|---|
| Change history endpoint | `api.md` |
| Change audit table or response model | `schema.md` |
| Change audit write/query/filter behavior | `business_rules.md` |
| Change history screen | `ui.md` |
