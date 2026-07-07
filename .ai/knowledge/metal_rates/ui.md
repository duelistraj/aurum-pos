---
type: ui
title: Metal Rates UI
description: Metal rate frontend behavior.
resource: .ai/knowledge/metal_rates/ui.md
tags: [aurum-pos, metal_rates, ui]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/metal_rates/INDEX.md]
  related: [.ai/knowledge/metal_rates/api.md, .ai/knowledge/auth/ui.md]
---

# Metal Rates UI

## Verified Facts

- `/rates` route renders `MetalRates`. Evidence: `frontend/src/App.tsx`.
- Metal rates page calls available metals, all rates, add rate, and manager password verification APIs. Evidence: `frontend/src/pages/MetalRates.tsx`; `frontend/src/api/client.ts`.
- Page clears old `localStorage` key `metal_rates`. Evidence: `frontend/src/pages/MetalRates.tsx`.
- Rate updates are gated by manager password verification. Evidence: `frontend/src/pages/MetalRates.tsx`.
