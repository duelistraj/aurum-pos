---
type: schema
title: Items Schema
description: Inventory tables and schemas.
resource: .ai/knowledge/items/schema.md
tags: [aurum-pos, items, schema]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/items/INDEX.md]
  related: [.ai/knowledge/items/api.md, .ai/knowledge/items/business_rules.md]
---

# Items Schema

## Table

| Table | Fields | Evidence |
|---|---|---|
| `items` | `id`, `sku`, `barcode` unique indexed, `category` indexed, `name`, `metal`, `purity`, `net_weight`, `making_charge`, `quantity`, `status`, `notes`, `created_at`, `updated_at` | `app/modules/items/models.py` |

## Relationships

- `Item.sale_items` relates to `SaleItem.item`. Evidence: `app/modules/items/models.py`; `app/modules/sales/models.py`.

## Pydantic Models

| Model | Fields / constraints | Evidence |
|---|---|---|
| `ItemBase` | required `sku`, `name`, `metal`; optional `barcode`, `notes`; default `category="jewellery"`; `purity` 0..100; `net_weight >= 0`; `making_charge >= 0`; `quantity >= 0` default 1 | `app/modules/items/schemas.py` |
| `ItemCreate`, `ItemUpdate` | inherit `ItemBase` | `app/modules/items/schemas.py` |
| `ItemOut` | item base plus `id`, `status` | `app/modules/items/schemas.py` |
| `ItemPaginationOut` | `items`, `total`, `page`, `limit`, `pages` | `app/modules/items/schemas.py` |
| `ItemPOSWithPrice` | POS item fields plus `pricing` dict | `app/modules/items/schemas.py` |

## Validation

- `category == "unique"` forces `net_weight` to `0`.
- Non-unique items reject `net_weight == 0`.
- Evidence: `app/modules/items/schemas.py`.
