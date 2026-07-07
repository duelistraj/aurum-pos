---
type: api
title: Changelog API
description: Audit history endpoint contract.
resource: .ai/knowledge/changelog/api.md
tags: [aurum-pos, changelog, api]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/changelog/INDEX.md]
  related: [.ai/knowledge/changelog/schema.md, .ai/knowledge/changelog/business_rules.md]
---

# Changelog API

## Routes

| Method | Path | Response | Evidence |
|---|---|---|---|
| GET | `/change-log/history` | `list[ChangeLogEntry]` | `app/modules/changelog/routes.py` |

## Query Parameters

- `barcode`, `invoice_no`, `action`, `from_date`, and `to_date` are accepted filters. Evidence: `app/modules/changelog/routes.py`; `frontend/src/api/client.ts`.
