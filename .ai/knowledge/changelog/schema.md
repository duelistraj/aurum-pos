---
type: schema
title: Changelog Schema
description: Audit log table and response schema.
resource: .ai/knowledge/changelog/schema.md
tags: [aurum-pos, changelog, schema]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/changelog/INDEX.md]
  related: [.ai/knowledge/changelog/api.md, .ai/knowledge/changelog/business_rules.md]
---

# Changelog Schema

## Table

| Table | Fields | Evidence |
|---|---|---|
| `change_log` | `id`, `entity`, `entity_id` indexed, `action`, `payload` JSON, `created_at` indexed | `app/core/changelog/models.py` |

## Pydantic Models

| Model | Fields | Evidence |
|---|---|---|
| `ChangeLogEntry` | `id`, `entity`, `entity_id`, `action`, `payload`, `created_at` | `app/modules/changelog/schemas.py` |
