---
type: ui
title: Changelog UI
description: Audit history frontend behavior.
resource: .ai/knowledge/changelog/ui.md
tags: [aurum-pos, changelog, ui]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/changelog/INDEX.md]
  related: [.ai/knowledge/changelog/api.md]
---

# Changelog UI

## Verified Facts

- `/history` route renders `History`. Evidence: `frontend/src/App.tsx`.
- History page calls `apiClient.getChangeLogHistory` with barcode, invoice number, action, and date filters. Evidence: `frontend/src/pages/History.tsx`; `frontend/src/api/client.ts`.
