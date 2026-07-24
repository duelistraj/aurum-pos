# Aurum POS

Aurum POS is an AGPL-3.0-only jewellery point-of-sale and inventory system.
It supports a shared-database, multi-shop hosted service and unlimited
self-hosting from the same public source tree.

## Product model

- Self-hosted deployments are unlimited and do not use billing.
- Aurum Cloud's free tier permits 50 active inventory records per shop.
- Aurum Cloud Pro removes the hosted item limit. The official Android app
  uses Google Play Billing with monthly and annual base plans.
- Owners can use verified email/password or Google. Staff join only through a
  shop invitation. Roles and entitlements are loaded from PostgreSQL.

Every tenant business table has a `shop_id`, shop-scoped constraints, and
forced PostgreSQL row-level security. Clients select a shop with `X-Shop-ID`.

When an existing self-hosted database is upgraded in place, legacy item rows
are retained under the `legacy-import` shop. Attach its first owner after the
migration with:

```bash
uv run python -m app.cli bootstrap-owner \
  --shop legacy-import \
  --owner-email owner@example.com \
  --owner-password 'replace-with-12-plus-characters' \
  --owner-name "Shop Owner"
```

## Local development

Python dependencies and locking use [uv](https://docs.astral.sh/uv/):

```bash
uv sync --locked
cp .env.example .env
docker compose -f compose.dev.yml up -d --wait postgres
uv run alembic upgrade head
uv run python -m app.cli bootstrap-shop \
  --name "Demo Shop" \
  --owner-email owner@example.com \
  --owner-password 'replace-with-12-plus-characters' \
  --owner-name "Demo Owner"
uv run uvicorn app.main:app --reload --port 8080
```

The backend always runs at `http://localhost:8080`; API documentation is at
`http://localhost:8080/docs`.

In another terminal:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

The frontend always runs at `http://localhost:5174` and fails if that port is
occupied. Local CORS is preconfigured for 5174. No application URL falls back
to port 8000.

## Distribution builds

The official Play build uses:

```env
VITE_DISTRIBUTION=cloud
VITE_API_URL=https://api.aurumpos.net
CAPACITOR_APP_ID=com.duelistraj.aurumpos
ANDROID_APPLICATION_ID=com.duelistraj.aurumpos
```

It is HTTPS-only, hides backend URL configuration, and includes native Google
Credential Manager and Play Billing bridges. Self-hosters leave the distribution
as `self_hosted`, configure their own HTTPS endpoint, application ID, signing key,
and Play listing if desired.

## Entitlement administration

Manual grants use the general subscription table:

```bash
uv run python -m app.cli grant-subscription \
  --shop bmr-chandiwala \
  --source complimentary \
  --starts-at 2026-07-21T00:00:00+00:00 \
  --expires-at 2027-01-01T00:00:00+00:00 \
  --notes "BMR Chandiwala migration entitlement"
```

There are no shop-specific entitlement branches.

## BMR item-only cutover

1. Stop legacy writes.
2. Set `LEGACY_DATABASE_URL` and run `uv run python scripts/export_legacy_items.py`.
3. Create the clean SaaS database and run Alembic.
4. Bootstrap the BMR shop and verified owner.
5. Run `uv run python -m app.cli import-items --shop bmr-chandiwala --file bmr-items.json`.
6. Apply the complimentary grant above and verify the reported row count and SHA-256.
7. Keep the isolated old database for 30 days, then drop it.

The importer preserves item UUIDs, values, quantities, status, and timestamps.
It does not import users, devices, rates, sales, sale lines, or change history.
Do not point the SaaS migration at the live BMR database: use a clean Aiven
database and retain the old EC2/database deployment only as the 30-day rollback
environment.

## Production

`compose.cloud.yml` is the lean single-EC2 topology: a loopback-only API and a
reliable worker behind host Nginx, with Aiven PostgreSQL. `AURUM_IMAGE` must be
a GHCR digest. Create an untracked `.env` from `.env.example`, assign the
runtime values, and provision it securely on the host. Compose loads that file
into the application containers. See
[`deploy/OPERATIONS.md`](deploy/OPERATIONS.md) for SSM deployment, TLS, SES,
Google RTDN, provider-managed recovery, and scaling gates.

Public privacy, terms, source, and account-deletion pages are published from
`site/` to `aurumpos.net`.

## Verification

```bash
uv run ruff check app tests scripts
uv run mypy app
uv run pytest
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

Set `RUN_INTEGRATION=1` to run the migrated PostgreSQL tenant flow.

## Source and license

Copyright © 2026 Aurum POS contributors.

Aurum POS is licensed under [GNU AGPL version 3 only](LICENSE). Hosted builds
expose their exact source revision through `/api/v1/version` and the in-app
source link. Releases published previously under MIT remain under their original
license.
