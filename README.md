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

Every tenant-facing business table has a `shop_id`, shop-scoped constraints, and forced PostgreSQL row-level security.
Global durable-job control tables use composite tenant foreign keys and are accessed only by trusted backend code.
Clients select a shop with `X-Shop-ID`.
Owners can deactivate access immediately and transfer shop ownership atomically to another active member.

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

Invoice PDFs are stored in the private S3 bucket configured by `AWS_REGION` and `S3_INVOICE_BUCKET`.
For local AWS access, use the normal SDK credential chain through `aws configure`, `AWS_PROFILE`, or temporary credentials exported in the shell.
Do not commit local AWS credentials or add them to the application settings.
Invoice numbers are assigned by the server, and checkout retries reuse a durable client operation key.
Sale requests commit a durable invoice job; the worker generates and uploads the PDF after the sale transaction completes.
The download endpoint reports a temporary pending state until the exact PostgreSQL-indexed object is ready.

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
VITE_GOOGLE_AUTH_ENABLED=true
CAPACITOR_APP_ID=com.duelistraj.aurumpos
ANDROID_APPLICATION_ID=com.duelistraj.aurumpos
```

It is HTTPS-only, always uses `https://api.aurumpos.net`, and has no runtime backend URL configuration.
The signed AAB enables Google Credential Manager and Play Billing and must be tested through Google Play Internal Testing so the Play App Signing certificate is used.
The debug APK is only a cloud UI and email/password smoke-test artifact, and it intentionally does not offer Google Sign-In.
The Google Web client ID comes from the backend `GOOGLE_WEB_CLIENT_ID` environment value through the public auth-provider metadata endpoint.

Self-hosted builds use:

```env
VITE_DISTRIBUTION=self_hosted
VITE_API_URL=https://pos.example.com
VITE_GOOGLE_AUTH_ENABLED=false
```

`VITE_API_URL` is mandatory for self-hosted production builds and cannot be changed from inside the application.
Self-hosters that enable Google authentication must configure their own backend Google Web client ID, Android OAuth client, package name, and signing certificate.

The manually triggered signed-AAB workflow requires `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and `PLAY_SERVICE_ACCOUNT_JSON` as encrypted secrets in the `play-internal` GitHub environment.
The Play credential belongs to a dedicated service account restricted to Aurum POS testing-track releases.
Its monotonically increasing version code remains unique across new runs and workflow reruns.
Run it with the full 40-character SHA of a revision that has a successful CI run.
The workflow executes Android unit tests and lint before bundling, removes the temporary keystore, and uploads the signed AAB directly to Google Play Internal Testing.
It never stores the signed AAB as a GitHub Actions artifact.
Promote that exact Play release from Internal Testing to Closed Testing and then Production without rebuilding it.
When testing requires a code change, create a new AAB with a new version code in Internal Testing and restart the promotion path.
Native access and refresh tokens are encrypted with Android Keystore.

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

`compose.cloud.yml` is the lean single-EC2 topology: a loopback-only two-process API and a reliable worker behind host Nginx, with Aiven PostgreSQL.
`AURUM_IMAGE` must be a GHCR digest.
Create an untracked `.env` from `.env.example`, assign the runtime values, and provision it securely on the host.
Compose loads that file into the application containers.
Database pool and bounded worker concurrency settings are explicit so the current host can be tuned without changing application code as traffic grows.
See [`deploy/OPERATIONS.md`](deploy/OPERATIONS.md) for SSM deployment, TLS, SES, private invoice storage, Google RTDN, provider-managed recovery, and scaling gates.

Aurum Cloud uses the private `aurum-pos-prod-duelistraj` bucket in `ap-southeast-1`.
The application automatically uses temporary credentials from the EC2 instance role and never requires static AWS access keys in production.

Public privacy, terms, source, and account-deletion pages are published from
`site/` to `aurumpos.net`.

## Verification

```bash
uv run pip-audit
uv run ruff check app tests scripts alembic/versions
uv run ruff format --check app tests scripts alembic/versions
uv run mypy app
uv run pytest
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

Set `RUN_INTEGRATION=1` after `uv run alembic upgrade head` to run the migrated PostgreSQL tenant, durable-job, ownership-transfer, and lifecycle flows.
Use [`loadtest/k6.js`](loadtest/k6.js) for launch and scale latency gates against an isolated representative environment.

## Source and license

Copyright © 2026 Aurum POS contributors.

Aurum POS is licensed under [GNU AGPL version 3 only](LICENSE). Hosted builds
expose their exact source revision through `/api/v1/version` and the in-app
source link. Releases published previously under MIT remain under their original
license.
