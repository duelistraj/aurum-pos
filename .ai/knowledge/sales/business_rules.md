---
type: business-rules
title: Sales Business Rules
description: Checkout, price lock, stock, and audit behavior.
resource: .ai/knowledge/sales/business_rules.md
tags: [aurum-pos, sales, rules]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/sales/INDEX.md]
  related: [.ai/knowledge/items/business_rules.md, .ai/knowledge/metal_rates/business_rules.md, .ai/knowledge/changelog/business_rules.md]
---

# Sales Business Rules

## Verified Facts

- Sale creation loads requested items and rejects missing items. Evidence: `app/modules/sales/service.py`.
- Sale creation rejects items not in `in_stock` status. Evidence: `app/modules/sales/service.py`.
- Requested quantity must not exceed available item quantity. Evidence: `app/modules/sales/service.py`.
- Each sale item locks pricing using `lock_price_at_sale`. Evidence: `app/modules/sales/service.py`; `app/modules/items/pricing.py`.
- Sale total is calculated from persisted sale item prices after all items are created. Evidence: `app/modules/sales/service.py`.
- Item quantity is decremented by sold quantity; status becomes `sold` when quantity reaches zero, otherwise remains `in_stock`. Evidence: `app/modules/sales/service.py`.
- Sale flow logs item sale events and sale creation to changelog. Evidence: `app/modules/sales/service.py`.
