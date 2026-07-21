# Decisions

### Standardize Python dependency management on uv

Recorded: 2026-07-21
Status: accepted
Basis: user-confirmed
Confirmed: 2026-07-21
Decision: Use uv 0.11.28 and `uv.lock` for local Python setup, CI, and container builds.
Rationale: The user explicitly requested that the repository switch from Poetry to uv.
Consequences: Python commands run through `uv run`; dependency installation uses `uv sync --locked`; Poetry artifacts are not part of the active workflow.

Evidence:
- `pyproject.toml::tool.uv`
- `Dockerfile::Keep the uv version aligned with pyproject.toml and CI`
- `.github/workflows/ci.yml::Install uv and Python`
- `README.md::Backend Setup`

### Keep distributable clients backend-configurable

Recorded: 2026-07-21
Status: accepted
Basis: source-backed
Decision: Allow the web and Android client to obtain a backend URL at runtime instead of requiring a shop-specific URL in every build.
Rationale: A generic release can serve multiple shops, each of which enters its own backend URL after installation.
Consequences: `VITE_API_URL` is a build default rather than the only endpoint source; startup presents API setup when no URL is configured; saved configuration is device-local.

Evidence:
- `README.md::Frontend Setup`
- `README.md::Android Builds`
- `frontend/src/App.tsx::App`
- `frontend/src/utils/apiConfig.ts::saveApiBaseUrl`

### Separate public image publication from shop deployment

Recorded: 2026-07-21
Status: accepted
Basis: source-backed
Decision: The public repository builds and publishes a generic GHCR API image but does not deploy it to a production server or domain.
Rationale: Shop-specific domains, credentials, certificates, customer data, and deployment automation must remain outside the public repository.
Consequences: Production operators supply their own `.env`, image/domain configuration, certificates, and private deployment workflow.

Evidence:
- `README.md::Docker`
- `README.md::Repository Hygiene`
- `SECURITY.md::Secrets`
- `.github/workflows/docker-publish.yml::Build and Push Docker Image`
