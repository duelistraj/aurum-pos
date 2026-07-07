---
type: business-rules
title: Dashboard Business Rules
description: Dashboard aggregation and KPI behavior.
resource: .ai/knowledge/dashboard/business_rules.md
tags: [aurum-pos, dashboard, rules]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/dashboard/INDEX.md]
  related: [.ai/knowledge/items/business_rules.md, .ai/knowledge/sales/business_rules.md, .ai/knowledge/metal_rates/business_rules.md]
---

# Dashboard Business Rules

## Verified Facts

- Summary counts in-stock item quantity and calculates stock/sale values from in-stock items. Evidence: `app/modules/dashboard/service.py`.
- Dashboard summary uses silver rate per gram in stock value calculation. Evidence: `app/modules/dashboard/service.py`.
- Suggested catalog value logic mirrors item pricing categories and making charge treatment. Evidence: `app/modules/dashboard/service.py`; `app/modules/items/pricing.py`.
- Analytics compares current and previous periods and returns KPI percentage changes. Evidence: `app/modules/dashboard/service.py`; `app/modules/dashboard/schemas.py`.
- Analytics builds sales overview, category share, inventory summary, and sales trend responses. Evidence: `app/modules/dashboard/service.py`; `app/modules/dashboard/schemas.py`.
