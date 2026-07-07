---
type: business-rules
title: Items Business Rules
description: Inventory behavior, pricing, labels, and stock rules.
resource: .ai/knowledge/items/business_rules.md
tags: [aurum-pos, items, rules]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/items/INDEX.md]
  related: [.ai/knowledge/items/api.md, .ai/knowledge/items/schema.md, .ai/knowledge/metal_rates/business_rules.md]
---

# Items Business Rules

## Verified Facts

- Creating an item generates a unique 8-digit barcode when omitted. Evidence: `app/modules/items/service.py`.
- Create, update, delete, and sale-related changes write audit rows through `log_change`. Evidence: `app/modules/items/service.py`; `app/modules/sales/service.py`.
- Only `in_stock` items can be edited or deleted. Evidence: `app/modules/items/service.py`.
- Default list filters to `Item.status == "in_stock"`. Evidence: `app/modules/items/service.py`.
- POS scan only returns `in_stock` items and calculates suggested price using latest metal rate. Evidence: `app/modules/items/service.py`; `app/modules/items/routes.py`.
- Fixed-making categories are `unique`, `ring`, `other`, and `pendant`. Evidence: `app/modules/items/pricing.py`.
- Non-fixed jewellery treats making charge as per-gram charge; fixed categories treat it as a fixed value. Evidence: `app/modules/items/pricing.py`.
- `unique` pricing ignores metal value and uses making charge as price. Evidence: `app/modules/items/pricing.py`.
- Locked sale pricing applies GST from `get_tax_profile`; current tax helper returns 3 percent for coin and jewellery with HSN `7114` for coin and `7113` otherwise. Evidence: `app/modules/items/pricing.py`; `app/modules/items/tax.py`.
- Silver locked pricing records effective purity as `100.0`. Evidence: `app/modules/items/pricing.py`.
