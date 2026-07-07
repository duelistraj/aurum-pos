---
type: ui
title: Items UI
description: Inventory frontend behavior.
resource: .ai/knowledge/items/ui.md
tags: [aurum-pos, items, ui]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/items/INDEX.md]
  related: [.ai/knowledge/items/api.md, .ai/knowledge/items/business_rules.md]
---

# Items UI

## Verified Facts

- `/items` route renders `Items`. Evidence: `frontend/src/App.tsx`.
- Inventory page calls item summary, item list, latest item, available metals, create/update/delete, manager verification, and batch label APIs. Evidence: `frontend/src/pages/Items.tsx`; `frontend/src/api/client.ts`.
- Add, edit, delete, and label download actions are gated by manage mode unlocked through manager password verification. Evidence: `frontend/src/pages/Items.tsx`.
- Label download uses `downloadBlob` and supports selected label file format from API call. Evidence: `frontend/src/pages/Items.tsx`; `frontend/src/utils.ts`.
