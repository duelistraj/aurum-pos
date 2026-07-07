---
type: ui
title: Auth UI
description: Frontend auth surfaces and client auth behavior.
resource: .ai/knowledge/auth/ui.md
tags: [aurum-pos, auth, ui]
timestamp: 2026-07-06

pkf:
  loads: [.ai/knowledge/auth/INDEX.md]
  related: [.ai/knowledge/auth/api.md, .ai/knowledge/auth/business_rules.md]
---

# Auth UI

## Verified Facts

- `/login` renders `Login`; all other app routes are wrapped in `ProtectedRoute`. Evidence: `frontend/src/App.tsx`.
- `ProtectedRoute` calls `getAccessToken()` and redirects unauthenticated users to `/login`. Evidence: `frontend/src/App.tsx`.
- Auth tokens and user info are stored in Capacitor Preferences. Evidence: `frontend/src/utils/auth.ts`.
- Device UUID is stored/generated through Capacitor Preferences. Evidence: `frontend/src/utils/device.ts`.
- The app shows `ApiSetup` before login when no runtime or build-time API URL is configured; saved API URLs use Capacitor Preferences with localStorage fallback. Evidence: `frontend/src/App.tsx`; `frontend/src/pages/ApiSetup.tsx`; `frontend/src/utils/apiConfig.ts`.
- Header includes a backend settings action that reopens `ApiSetup` after initial setup. Evidence: `frontend/src/components/Header.tsx`.
- Axios request interceptor attaches access token and device UUID headers. Evidence: `frontend/src/api/client.ts`.
- Axios request and refresh-token calls resolve the API base URL dynamically from runtime config. Evidence: `frontend/src/api/client.ts`; `frontend/src/utils/apiConfig.ts`.
- Axios response interceptor refreshes access token on 401 and clears auth state on refresh failure. Evidence: `frontend/src/api/client.ts`.
