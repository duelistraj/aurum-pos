---
type: business-rules
title: Metal Rates Business Rules
description: Metal rate behavior and lookup rules.
resource: .ai/knowledge/metal_rates/business_rules.md
tags: [aurum-pos, metal_rates, rules]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/metal_rates/INDEX.md]
  related: [.ai/knowledge/metal_rates/api.md, .ai/knowledge/metal_rates/schema.md, .ai/knowledge/items/business_rules.md]
---

# Metal Rates Business Rules

## Verified Facts

- `add_metal_rate` creates a rate from `MetalRateCreate`. Evidence: `app/modules/metal_rates/service.py`.
- `get_available_metals` returns available metal/purity combinations. Evidence: `app/modules/metal_rates/service.py`.
- `get_all_metal_rates` returns stored metal rates. Evidence: `app/modules/metal_rates/service.py`.
- `get_latest_metal_rate` looks up the latest rate for metal/purity; silver is always priced at 100 percent purity. Evidence: `app/modules/metal_rates/service.py`.
- Item POS pricing depends on latest metal rate lookup. Evidence: `app/modules/items/routes.py`.
