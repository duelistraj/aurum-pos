# Decisions

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
Decision: Official Android builds use package `com.duelistraj.aurumpos` and fixed API `https://api.aurumpos.net`; self-hosted builds configure their own app ID and backend URL.
Rationale: The user explicitly limited the official service to Android and required one cloud endpoint while retaining free self-hosting.
Consequences: Cloud builds hide API setup and ignore saved URLs. Self-hosted builds keep runtime endpoint configuration and unlimited entitlements.

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
Consequences: Operators supply `.env.cloud`, DNS, AWS/Aiven resources, signing configuration, and the selected image digest.

Evidence:
- `.github/workflows/ci.yml::publish-image`
- `compose.cloud.yml::services`
- `deploy/OPERATIONS.md::Required preparation`

### Promote production through a private operations repository

Recorded: 2026-07-23
Status: accepted
Basis: user-confirmed
Decision: Successful public CI publishes an immutable GHCR image; a private
operations repository promotes an approved digest to production through AWS
OIDC and SSM. Production uses host Nginx and Certbot in front of the
loopback-only API.
Rationale: The user selected private operations CD, digest promotion by pull
request, and host Nginx while keeping production authority outside the
open-source repository.
Consequences: Public pull requests cannot access production credentials.
Production changes are auditable digest updates, and mutable image tags are
never deployment inputs.

Evidence:
- `.github/workflows/ci.yml::publish-image`
- `compose.cloud.yml::services.api`
- `deploy/nginx-api.conf`
- `deploy/OPERATIONS.md::Deployment`

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

### Use shared-database shop tenancy and shop entitlements

Recorded: 2026-07-21
Status: accepted
Basis: user-confirmed
Decision: Shops share PostgreSQL with tenant keys and forced RLS. Hosted free shops are capped at 50 active item rows; Pro belongs to a shop and is sold through Google Play. Self-hosted mode is unlimited.
Rationale: The user explicitly rejected one database per shop and requested cloud-infrastructure billing with free self-hosting.
Consequences: Every tenant request selects a shop; roles and subscriptions are database state; Play tokens are verified server-side.

Evidence:
- `alembic/versions/c3d4e5f6a7b8_add_saas_tenancy.py::upgrade`
- `app/modules/subscriptions/service.py::resolve_entitlement`
- `app/modules/billing/service.py::verify_play_purchase`

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
Consequences: The item manifest is counted and checksummed; the general complimentary grant expires at `2027-01-01T00:00:00Z`; there is no BMR-specific entitlement branch.

Evidence:
- `scripts/export_legacy_items.py::export`
- `app/cli.py::import_items`
- `README.md::BMR item-only cutover`
