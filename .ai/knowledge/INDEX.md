---
type: index
title: Knowledge Index
description: Root router for aurum-pos OKF knowledge.
resource: .ai/knowledge/INDEX.md
tags: [aurum-pos, routing, index]
timestamp: 2026-07-06

pkf:
  loads: []
  related: [.ai/MEMORY.md, .ai/ARCHITECTURE.md, .ai/knowledge/dependencies.md, .ai/knowledge/glossary.md]
---

# Knowledge Index

## Modules

| Module | Load | Summary | Source paths |
|---|---|---|---|
| auth | `.ai/knowledge/auth/INDEX.md` | Login, JWT refresh, device registration, auth dependencies, manager password check. | `app/modules/auth/`, `frontend/src/pages/Login.tsx`, `frontend/src/utils/auth.ts` |
| items | `.ai/knowledge/items/INDEX.md` | Inventory CRUD, scan lookup, summaries, pricing, label exports. | `app/modules/items/`, `frontend/src/pages/Items.tsx` |
| metal_rates | `.ai/knowledge/metal_rates/INDEX.md` | Metal rate creation and lookup by metal/purity. | `app/modules/metal_rates/`, `frontend/src/pages/MetalRates.tsx` |
| sales | `.ai/knowledge/sales/INDEX.md` | POS sale creation, stock decrement, sale item price lock. | `app/modules/sales/`, `frontend/src/pages/POS.tsx` |
| invoices | `.ai/knowledge/invoices/INDEX.md` | Sale invoice PDF rendering and download route. | `app/modules/invoices/`, `frontend/src/pages/POS.tsx` |
| dashboard | `.ai/knowledge/dashboard/INDEX.md` | Summary KPIs and analytics charts. | `app/modules/dashboard/`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Analytics.tsx` |
| changelog | `.ai/knowledge/changelog/INDEX.md` | Audit log persistence/query and history UI. | `app/core/changelog/`, `app/modules/changelog/`, `frontend/src/pages/History.tsx` |

## Task Routing

| Task | Load |
|---|---|
| API route change | Root index -> module `INDEX.md` -> module `api.md` |
| SQLAlchemy model, Pydantic schema, or migration impact | Root index -> module `INDEX.md` -> module `schema.md` |
| Service logic, validation, pricing, stock, auth, or audit behavior | Root index -> module `INDEX.md` -> module `business_rules.md` |
| React screen, client wrapper, storage, or download behavior | Root index -> module `INDEX.md` -> module `ui.md` |
| Dependencies, deployment, Docker, workflows, or env keys | `.ai/knowledge/dependencies.md` plus affected module index |
| Repository layout | `.ai/ARCHITECTURE.md` and this index |

## Keywords

| Keyword | Module |
|---|---|
| login, JWT, refresh, device, role, manager password, `X-Device-UUID` | auth |
| item, inventory, barcode, SKU, label, stock, pricing, GST, HSN | items |
| rate, purity, gold, silver, platinum, `rate_per_gram` | metal_rates |
| sale, POS, checkout, invoice number, stock decrement, price breakdown | sales |
| invoice PDF, reportlab, `/sales/{sale_id}/invoice` | invoices |
| KPI, analytics, chart, dashboard, category share, trend | dashboard |
| history, audit, change_log, payload, action | changelog |
