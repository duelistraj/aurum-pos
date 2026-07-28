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
docker compose -f compose.cloud.yml stop worker
docker compose -f compose.cloud.yml run --rm api alembic upgrade head
docker compose -f compose.cloud.yml up -d --remove-orphans api

attempt=0
until curl -fsS http://127.0.0.1:8000/health/ready >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "API readiness did not recover after deployment" >&2
    exit 1
  fi
  sleep 2
done

docker compose -f compose.cloud.yml up -d worker

attempt=0
until curl -fsS http://127.0.0.1:8000/health/worker >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Worker heartbeat did not recover after deployment" >&2
    exit 1
  fi
  sleep 2
done
