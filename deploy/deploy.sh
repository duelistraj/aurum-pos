#!/usr/bin/env sh
set -eu

: "${AURUM_IMAGE:?Set AURUM_IMAGE to an immutable image digest}"
case "$AURUM_IMAGE" in
  *@sha256:*) ;;
  *) echo "AURUM_IMAGE must be pinned by sha256 digest" >&2; exit 2 ;;
esac

test -f .env || {
  echo "Missing .env" >&2
  exit 2
}

docker compose -f compose.cloud.yml pull api worker
docker compose -f compose.cloud.yml run --rm api alembic upgrade head
docker compose -f compose.cloud.yml up -d --remove-orphans
docker compose -f compose.cloud.yml exec -T api \
  curl -fsS http://localhost:8000/health/ready
