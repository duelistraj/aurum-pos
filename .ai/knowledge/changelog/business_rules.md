---
type: business-rules
title: Changelog Business Rules
description: Audit persistence and history filtering.
resource: .ai/knowledge/changelog/business_rules.md
tags: [aurum-pos, changelog, rules]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/changelog/INDEX.md]
  related: [.ai/knowledge/items/business_rules.md, .ai/knowledge/sales/business_rules.md]
---

# Changelog Business Rules

## Verified Facts

- Shared `log_change` writes `entity`, `entity_id`, `action`, and `payload` to `change_log`. Evidence: `app/core/changelog/service.py`.
- Item create/update/delete operations log changes. Evidence: `app/modules/items/service.py`.
- Sale creation logs sale and item sale events. Evidence: `app/modules/sales/service.py`.
- History query can filter payload by barcode or invoice number. Evidence: `app/modules/changelog/service.py`.
- History query can filter by action and date range. Evidence: `app/modules/changelog/routes.py`; `app/modules/changelog/service.py`.
