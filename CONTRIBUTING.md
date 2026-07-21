# Contributing

## Development

1. Copy `.env.example` to `.env` and set local values.
2. Start PostgreSQL with `docker compose -f compose.dev.yml up -d --wait postgres`.
3. Install backend dependencies with `uv sync --locked`.
4. Run migrations with `uv run alembic upgrade head`.
5. Install frontend dependencies from `frontend/` with `npm ci`.
6. Run backend and frontend checks before opening a pull request.

Keep shop-specific deployment files, domains, customer data, Android signing
keys, and production secrets out of this public repository.
