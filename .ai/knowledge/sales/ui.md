---
type: ui
title: Sales UI
description: POS frontend behavior.
resource: .ai/knowledge/sales/ui.md
tags: [aurum-pos, sales, ui]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/sales/INDEX.md]
  related: [.ai/knowledge/items/ui.md, .ai/knowledge/invoices/ui.md]
---

# Sales UI

## Verified Facts

- `/pos` route renders `POS`. Evidence: `frontend/src/App.tsx`.
- POS scans items through `apiClient.getItemForPOS` and creates sales through `apiClient.createSale`. Evidence: `frontend/src/pages/POS.tsx`; `frontend/src/api/client.ts`.
- POS checks browser `BarcodeDetector` support for camera scanning. Evidence: `frontend/src/pages/POS.tsx`.
- After sale creation, POS attempts invoice PDF download using `apiClient.getInvoicePDF` and `downloadBlob`. Evidence: `frontend/src/pages/POS.tsx`.
