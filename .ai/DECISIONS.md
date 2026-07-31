# Decisions

### Raise the hosted Free inventory limit to 500

Recorded: 2026-07-30
Status: accepted
Basis: user-confirmed
Decision: Aurum Cloud Free supports up to 500 active inventory rows in its primary shop.
Rationale: The user explicitly selected a more useful free tier that gives small jewellery retailers enough room to adopt the product while preserving unlimited inventory as a Pro benefit.
Consequences: The backend entitlement default, hosted production configuration, public pricing, service terms, and operator documentation use the same 500-item threshold.

Evidence:
- `app/core/config.py::Settings.free_active_item_limit`
- `.env.example::FREE_ACTIVE_ITEM_LIMIT`
- `site/index.html::pricing`
- `site/terms.html::Aurum Cloud plans`

### Keep PostgreSQL authoritative for private S3 invoices

Recorded: 2026-07-25
Status: accepted
Basis: user-confirmed
Decision: Store invoice PDFs in a private S3 bucket under UUID-based tenant keys while PostgreSQL remains the authoritative invoice index and authorization boundary.
Rationale: The user explicitly required private object storage, EC2 instance-role credentials, database-backed tenant authorization, and no bucket listing in the normal invoice flow.
Consequences: Sale creation commits a durable database job before returning, the worker generates and retries the PDF under an expiring lease, presigned URLs are short-lived and never persisted, and production IAM needs object-scoped GetObject and PutObject permissions.
Confirmed account deletion is the only object deletion path and additionally needs object-scoped DeleteObject so exact PostgreSQL-indexed invoice keys can be removed before shop deletion.

Evidence:
- `app/modules/sales/storage.py::InvoiceStorage`
- `app/jobs/invoices.py::process_invoice_jobs`
- `alembic/versions/f7b8c9d0e1f2_add_invoice_s3_metadata.py::upgrade`

### Standardize Python dependency management on uv

Recorded: 2026-07-21
Status: accepted
Basis: user-confirmed
Decision: Use uv 0.11.28 and `uv.lock` for local Python setup, CI, and container builds.
Rationale: The user explicitly requested that the repository switch from Poetry to uv.
Consequences: Python commands run through `uv run`; dependency installation uses `uv sync --locked`; Poetry artifacts are not active.

Evidence:
- `pyproject.toml::tool.uv`
- `.github/workflows/ci.yml::Install uv and Python`

### Split official cloud and self-hosted client configuration

Recorded: 2026-07-21
Status: accepted
Basis: user-confirmed
Decision: Official Android builds use package `com.duelistraj.aurumpos` and fixed API `https://api.aurumpos.net`; self-hosted builds configure their own app ID and backend URL at build time.
Rationale: The user explicitly limited the official service to Android and required one cloud endpoint while retaining free self-hosting.
Consequences: Cloud builds hide API setup and ignore saved URLs.
Self-hosted builds require `VITE_API_URL`, do not support runtime backend switching, and retain unlimited entitlements.
The backend exposes the public Google provider ID from `GOOGLE_WEB_CLIENT_ID`; debug APKs omit Google Sign-In and signed Play builds enable it.

Evidence:
- `README.md::Distribution builds`
- `frontend/src/utils/apiConfig.ts::getApiBaseUrl`
- `frontend/capacitor.config.ts::config`

### Publish generic images without public-repository deployment

Recorded: 2026-07-21
Status: accepted
Basis: source-backed
Decision: The public repository publishes generic digest-addressable GHCR images and contains operator templates, but it does not deploy production infrastructure.
Rationale: Credentials, customer data, and deployment authority remain outside the public repository.
Consequences: Self-hosters supply `.env`, DNS, AWS/Aiven resources, signing configuration, and the selected image digest.
Official production instead retrieves its configured SecureStrings through the private operations deployment.

Evidence:
- `.github/workflows/ci.yml::publish-image`
- `compose.cloud.yml::services`
- `deploy/OPERATIONS.md::Production source of truth`

### Deliver official Android bundles directly to Google Play

Recorded: 2026-07-28
Status: accepted
Basis: user-confirmed
Decision: Build official signed Android bundles on standard public-repository runners and upload them directly to the Google Play Internal Testing track without publishing the signed AAB as a GitHub Actions artifact.
Promote the same Play release from Internal Testing to Closed Testing and then Production without rebuilding it.
Rationale: The user wants to retain free public-repository build capacity while preventing official signed AABs from being distributed through GitHub.
Consequences: The release workflow uses a dedicated testing-track Play service account, removes the temporary keystore after signing, uploads only non-secret source and checksum provenance, and never accepts a production track as an input.
A code change always creates a new version code and restarts testing from the Internal Testing track.

Evidence:
- `.github/workflows/android-release.yml::release-aab`
- `tests/test_android_workflows.py::test_signed_aab_releases_directly_to_play_without_github_artifact`

### Host the authenticated browser client on manual Amplify deployments

Recorded: 2026-07-31
Status: accepted
Basis: user-confirmed
Decision: Keep `aurumpos.net` on GitHub Pages and host the authenticated SPA at `app.aurumpos.net` on an unconnected Amplify app whose artifacts are promoted manually from the private operations repository.
Android Internal Testing and the web manifest must use the same approved public source commit.
Rationale: The user explicitly selected the domain split, Amplify managed static hosting, private release authority, and shared Android and web source provenance.
Consequences: Cloud browser builds call only `https://api.aurumpos.net`, keep Google authentication disabled, emit deterministic release metadata, and deploy only after a manifest-only operations pull request.
The browser stores access tokens only in memory, keeps refresh tokens in the existing HttpOnly cookie, persists an untrusted installation UUID, and guards every native plugin boundary.

Evidence:
- `frontend/src/utils/apiConfig.ts::getApiBaseUrl`
- `frontend/scripts/write-release-metadata.mjs`
- `docs/PRODUCTION_WEB.md`

### Use one canonical application release version

Recorded: 2026-07-29
Status: accepted
Basis: user-confirmed
Decision: Use the repository-root `VERSION` file as the canonical Aurum POS application release version and synchronize package and native metadata with it.
Rationale: The user requested a meaningful in-app version and explicitly selected `0.1.0` as the canonical value.
Consequences: Backend and frontend builds consume the canonical value, Android uses it as `versionName`, the settings menu displays it, and automated tests detect metadata drift.

Evidence:
- `VERSION`
- `app/version.py::APP_VERSION`
- `frontend/releaseVersion.ts::RELEASE_VERSION`
- `tests/test_version_contract.py::test_release_metadata_uses_the_canonical_version`

### Use one runtime environment contract

Recorded: 2026-07-24
Status: accepted
Basis: user-confirmed
Decision: Keep one backend runtime key contract in `.env.example`, keep the frontend example and local files on one Vite key contract, and store each official production runtime value in its own KMS-encrypted SSM SecureString.
Rationale: The user explicitly requested fewer environment files and aligned
variables across backend and frontend configuration. The user explicitly made
database backup and retention an infrastructure-provider responsibility.
Consequences: Automated tests detect runtime key drift.
The private operations deployment retrieves the authoritative key list and atomically creates the host `.env` for the API and worker.
Operators do not populate a local production `.env`.
`MIGRATION_DATABASE_URL` remains a separate parameter available only to the migration container.
No application-managed database backup configuration is part of the runtime contract.

Evidence:
- `tests/test_env_contract.py::test_backend_environment_template_matches_settings`
- `compose.cloud.yml::services.api.env_file`
- `deploy/OPERATIONS.md::Data protection and recovery`

### Promote production through a private operations repository

Recorded: 2026-07-23
Status: accepted
Basis: user-confirmed
Decision: Successful public CI publishes an immutable GHCR image; a private operations repository promotes an approved digest to production through AWS OIDC and SSM.
Production uses host Nginx and Certbot in front of the loopback-only API.
Rationale: The user selected private operations CD, digest promotion by pull request, and host Nginx while keeping production authority outside the open-source repository.
Consequences: Public pull requests cannot access production credentials.
Production changes are auditable digest updates, and mutable image tags are never deployment inputs.
Every deployment retrieves the exact required KMS-encrypted SecureStrings from SSM, atomically assembles the validated host runtime file, uses both workflow and host concurrency controls, pauses the worker before migration, keeps the old API running until migration succeeds, and verifies the public immutable image and configuration revisions.
The separate migration administrator URL is exposed only to the one-shot migration container.
Application rollback redeploys an earlier immutable digest without automatically downgrading the database.

Evidence:
- `.github/workflows/ci.yml::publish-image`
- `compose.cloud.yml::services.api`
- `deploy/nginx-api.conf`
- `deploy/OPERATIONS.md::Production deployment behavior`

### License future releases under AGPL version 3 only

Recorded: 2026-07-21
Status: accepted
Basis: user-confirmed
Decision: License current and future repository releases as `AGPL-3.0-only`; previously published MIT releases retain their original license.
Rationale: The user explicitly requested AGPL 3.0 while keeping Aurum POS open source.
Consequences: Package metadata, container labels, contribution guidance, and the source UI identify AGPL-3.0-only and the exact hosted source revision.

Evidence:
- `LICENSE`
- `pyproject.toml::project.license`
- `app/main.py::version`

### Use shared-database shop tenancy and organization entitlements

Recorded: 2026-07-21
Status: accepted
Basis: user-confirmed
Decision: Shops share PostgreSQL with tenant keys, explicit shop predicates, forced RLS, and a restricted production runtime role.
An organization owns one or more shops and holds one shared entitlement.
Hosted Free supports one shop, two distinct organization seats, and 500 active item rows in the primary shop.
Hosted Pro supports up to three shops, ten distinct organization seats, and unlimited active item rows.
Self-hosted mode is unlimited across shops, seats, and inventory.
One email consumes one seat across the organization even when assigned to multiple shops, and a pending invitation reserves that seat.
After Pro expires, the primary shop remains writable under the Free item limit while additional shops become read-only without data loss.
Organization ownership transfer durably cancels Google Play renewal before moving all shops, while the existing entitlement remains active through its paid expiry.
Rationale: The user explicitly rejected one database per shop and requested cloud-infrastructure billing with free self-hosting.
The user explicitly selected organization-level Pro, the hosted plan limits, distinct organization seats, read-only downgrade behavior, and billing-safe organization ownership transfer.
The user explicitly selected defense in depth using query scoping plus a `NOBYPASSRLS` runtime credential separated from the Alembic administrator credential.
Consequences: Every tenant request selects and validates a shop and its organization, tenant-aware queries include the shop UUID, roles and subscriptions are database state, and Play tokens are verified server-side against the organization.
Production migrations use a transient administrator URL that is not written to the API or worker runtime environment.

Evidence:
- `alembic/versions/c3d4e5f6a7b8_add_saas_tenancy.py::upgrade`
- `alembic/versions/t9u0v1w2x3y4_add_organizations.py::upgrade`
- `app/modules/items/service.py::get_item_by_id`
- `app/modules/dashboard/service.py::get_dashboard_summary`
- `app/modules/subscriptions/service.py::resolve_entitlement`
- `app/modules/billing/service.py::verify_play_purchase`
- `app/jobs/ownership_transfers.py::process_organization_ownership_transfers`

### Brand the paid entitlement as Pro end to end

Recorded: 2026-07-22
Status: accepted
Basis: user-confirmed
Decision: Use `pro` as the paid entitlement value and `aurum_cloud_pro` as the Google Play product identifier, and present the tier as Aurum Cloud Pro.
Rationale: The user explicitly requested a full pre-launch rename and confirmed that no paid Premium purchases exist.
Consequences: The database, API, CLI, Android client, public copy, and new Play listing use Pro without a legacy Premium compatibility path.

Evidence:
- `alembic/versions/e5f6a7b8c9d0_rename_premium_plan_to_pro.py::upgrade`
- `app/modules/subscriptions/service.py::resolve_entitlement`
- `frontend/src/constants/billing.ts::PLAY_PRODUCT_ID`

### Preserve only BMR inventory during SaaS cutover

Recorded: 2026-07-21
Status: accepted
Basis: user-confirmed
Decision: Export and import BMR items exactly into a clean SaaS database; do not migrate other legacy BMR rows. Keep the old deployment isolated for 30 days.
Rationale: The user explicitly identified the items table as valuable and allowed all other current BMR data to be removed.
Consequences: The item manifest is counted and checksummed; every imported item receives an analytics baseline at its imported creation timestamp; the general complimentary grant expires at `2027-01-01T00:00:00Z`; there is no BMR-specific entitlement branch.

Evidence:
- `scripts/export_legacy_items.py::export`
- `app/cli.py::import_items`
- `README.md::BMR item-only cutover`
