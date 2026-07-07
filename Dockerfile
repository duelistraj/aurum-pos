#############################################
# Builder Stage
#############################################

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_HOME=/opt/poetry \
    POETRY_VERSION=2.1.4 \
    PATH="/opt/poetry/bin:$PATH"

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 - --version ${POETRY_VERSION}

# Verify Poetry installation
RUN poetry --version

# Copy dependency files first (Docker layer caching)
COPY pyproject.toml poetry.lock ./

# Create virtual environment inside the project
RUN poetry config virtualenvs.in-project true

# Install production dependencies
RUN poetry install \
    --only main \
    --no-interaction \
    --no-root

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
RUN apt-get update && apt-get install -y \
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