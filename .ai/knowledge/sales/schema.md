---
type: schema
title: Sales Schema
description: Sales tables and Pydantic models.
resource: .ai/knowledge/sales/schema.md
tags: [aurum-pos, sales, schema]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/sales/INDEX.md]
  related: [.ai/knowledge/sales/api.md, .ai/knowledge/items/schema.md]
---

# Sales Schema

## Tables

| Table | Fields | Evidence |
|---|---|---|
| `sales` | `id`, `invoice_no` unique, `total_amount`, `created_at`, `customer_name`, `customer_phone`, `customer_address`, `customer_state`, `customer_state_code` | `app/modules/sales/models.py` |
| `sale_items` | `id`, `sale_id`, `item_id`, `quantity`, `price`, `price_breakdown` JSON | `app/modules/sales/models.py` |

## Relationships

- `Sale.items` cascades delete-orphan to `SaleItem`. Evidence: `app/modules/sales/models.py`.
- `SaleItem.sale_id` references `sales.id` with cascade delete. Evidence: `app/modules/sales/models.py`.
- `SaleItem.item_id` references `items.id`. Evidence: `app/modules/sales/models.py`.

## Pydantic Models

| Model | Fields | Evidence |
|---|---|---|
| `SaleItemInput` | `item_id`, `quantity >= 1` default 1 | `app/modules/sales/schemas.py` |
| `SaleCreate` | `invoice_no`, `items`, `customer_name`, `customer_phone`, optional `customer_address`, optional `total_amount` | `app/modules/sales/schemas.py` |
| `SaleOut` | `id`, `invoice_no`, `total_amount` | `app/modules/sales/schemas.py` |
