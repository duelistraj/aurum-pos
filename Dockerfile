#############################################
# Builder Stage
#############################################

FROM python:3.12-slim AS builder

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
COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /uvx /bin/

# Install production dependencies in a cacheable layer.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

# Copy application
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

#############################################
# Runtime Stage
#############################################

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

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

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
