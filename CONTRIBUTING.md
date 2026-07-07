# Contributing

## Development

1. Copy `.env.example` to `.env` and set local values.
2. Install backend dependencies with `poetry install`.
3. Run migrations with `poetry run alembic upgrade head`.
4. Install frontend dependencies from `frontend/` with `npm install`.
5. Run backend and frontend checks before opening a pull request.

Keep shop-specific deployment files, domains, customer data, Android signing
keys, and production secrets out of this public repository.
