---
type: api
title: Sales API
description: Sale endpoint contract.
resource: .ai/knowledge/sales/api.md
tags: [aurum-pos, sales, api]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/sales/INDEX.md]
  related: [.ai/knowledge/sales/schema.md, .ai/knowledge/sales/business_rules.md, .ai/knowledge/invoices/api.md]
---

# Sales API

## Routes

| Method | Path | Response | Evidence |
|---|---|---|---|
| POST | `/sales/` | `SaleOut` | `app/modules/sales/routes.py` |

## Client Calls

- `apiClient.createSale` posts invoice number, sale items with item id and quantity, customer fields, and optional total amount. Evidence: `frontend/src/api/client.ts`.
- POS also calls `/items/pos/scan/{barcode}` and invoice PDF download around sale creation. Evidence: `frontend/src/pages/POS.tsx`; `frontend/src/api/client.ts`.
