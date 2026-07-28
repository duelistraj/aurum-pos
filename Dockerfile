#############################################
# Builder Stage
#############################################

FROM python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Install build dependencies used by packages without compatible wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Keep the uv version aligned with pyproject.toml and CI.
COPY --from=ghcr.io/astral-sh/uv:0.11.28@sha256:0f36cb9361a3346885ca3677e3767016687b5a170c1a6b88465ec14aefec90aa /uv /uvx /bin/

# Install production dependencies in a cacheable layer.
COPY pyproject.toml uv.lock LICENSE README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

# Copy application
COPY app ./app
COPY alembic ./alembic
COPY site ./site
COPY alembic.ini .

#############################################
# Runtime Stage
#############################################

FROM python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de AS runtime

ARG VCS_REF=development

LABEL org.opencontainers.image.source="https://github.com/duelistraj/aurum-pos" \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    FORWARDED_ALLOW_IPS=127.0.0.1 \
    GIT_SHA=$VCS_REF

WORKDIR /app

# curl is required for the Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser

# Copy virtual environment
COPY --from=builder /app/.venv /app/.venv

# Copy application
COPY --from=builder --chown=appuser:appgroup /app /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers=2", "--proxy-headers", "--no-access-log"]
