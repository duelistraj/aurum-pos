---
type: ui
title: Dashboard UI
description: Dashboard and analytics frontend behavior.
resource: .ai/knowledge/dashboard/ui.md
tags: [aurum-pos, dashboard, ui]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/dashboard/INDEX.md]
  related: [.ai/knowledge/dashboard/api.md]
---

# Dashboard UI

## Verified Facts

- `/` route renders `Dashboard`; `/analytics` renders `Analytics`. Evidence: `frontend/src/App.tsx`.
- Dashboard page calls `apiClient.getDashboardSummary`. Evidence: `frontend/src/pages/Dashboard.tsx`; `frontend/src/api/client.ts`.
- Analytics page calls `apiClient.getDashboardAnalytics(from_date, to_date, metal)`. Evidence: `frontend/src/pages/Analytics.tsx`; `frontend/src/api/client.ts`.
- Analytics uses Chart.js through `react-chartjs-2` for line and doughnut charts. Evidence: `frontend/src/pages/Analytics.tsx`; `frontend/package.json`.
