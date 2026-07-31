# Production web client

The authenticated production browser client is built with `VITE_DISTRIBUTION=cloud` and `VITE_GOOGLE_AUTH_ENABLED=false`.
Cloud builds call only `https://api.aurumpos.net`.
The marketing, legal, support, verification, password-recovery, and account-deletion pages remain at `https://aurumpos.net`.

## Browser and native boundaries

Native access and refresh tokens remain encrypted through the Android Keystore plugin.
Browser access tokens remain only in JavaScript memory, while browser refresh tokens use the existing HttpOnly, Secure, path-scoped SameSite cookie.
Reloaded and new browser tabs restore their access token through the refresh endpoint.
Browser tabs serialize refresh calls and broadcast logout or session expiry without broadcasting credentials.

Android device identifiers retain their existing Capacitor preference behavior.
Browsers generate a random installation UUID, persist it locally, and send it only as an untrusted installation correlation value.
It is not a hardware identifier and must never be used as proof of device identity.

Android filesystem, notification, billing, Google authentication, and camera paths execute only after a native-platform guard.
Browser exports use object URLs and browser downloads.
Presigned invoice URLs open without an opener or referrer and expire server-side.
Browser barcode input remains manual.
The application does not expose an unsupported browser printing API.
Browser navigation relies on normal history, and production hosting rewrites direct extensionless routes through `index.html`.

## Authentication risk

The refresh cookie alone cannot authorize tenant APIs because business requests require an access bearer token.
SameSite cookie behavior, exact credentialed CORS, device binding, and the refresh-only cookie path limit CSRF exposure.
Logout revokes the server session, clears in-memory browser state, and notifies other tabs.
Invitation tokens are removed from the visible URL immediately after capture.
Recovery pages keep their existing URL scrubbing and no-referrer behavior.

Moving browser access tokens out of Web Storage removes persistent token theft from local or session storage.
An active same-origin script injection could still read in-memory state or issue authorized requests while the session is open.
Production therefore requires the enforced script CSP, short access-token lifetime, dependency audit, URL token scrubbing, and server-side session revocation.

## Release verification

Every production build emits `/release.json` with the public source SHA, exact Node and npm versions, build environment, and SHA-256 for each hosted file.
The private operations workflow packages the directory deterministically, verifies its checksum before upload, and reconstructs the archive from hosted bytes after Amplify reports success.
Android Internal Testing and web promotion must reference the same approved public commit SHA.

The production dependency audit currently permits only `GHSA-qwww-vcr4-c8h2`, which applies to React Router's RSC request-handling path.
Aurum POS is a client-only Vite SPA and does not enable React Server Components.
The audit gate verifies that no RSC marker is present and fails for every other production advisory.
This temporary exception must be removed as soon as an upstream non-breaking release resolves the advisory.
