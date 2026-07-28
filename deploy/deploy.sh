#!/usr/bin/env sh
set -eu

: "${AURUM_IMAGE:?Set AURUM_IMAGE to an immutable image digest}"
: "${AURUM_GIT_SHA:?Set AURUM_GIT_SHA to the deployed commit}"
: "${AURUM_CONFIG_REVISION:?Set AURUM_CONFIG_REVISION}"
: "${MIGRATION_DATABASE_URL:?Set MIGRATION_DATABASE_URL for the operator-only role}"
: "${AURUM_PUBLIC_API_URL:?Set AURUM_PUBLIC_API_URL to the public HTTPS API origin}"

case "$AURUM_IMAGE" in
  *@sha256:*) ;;
  *) echo "AURUM_IMAGE must be pinned by sha256 digest" >&2; exit 2 ;;
esac
case "$AURUM_PUBLIC_API_URL" in
  https://*) ;;
  *) echo "AURUM_PUBLIC_API_URL must use HTTPS" >&2; exit 2 ;;
esac

test -f .env || {
  echo "Missing .env" >&2
  exit 2
}

exec 9>.aurum-deploy.lock
if ! flock -n 9; then
  echo "Another Aurum deployment is active" >&2
  exit 1
fi

previous_image=""
previous_git_sha=""
previous_config_revision=""
previous_api_id="$(docker compose -f compose.cloud.yml ps -q api || true)"
if [ -n "$previous_api_id" ]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$previous_api_id")"
  previous_git_sha="$(
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$previous_api_id" |
      awk -F= '$1 == "GIT_SHA" {print substr($0, index($0, "=") + 1)}'
  )"
  previous_config_revision="$(
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$previous_api_id" |
      awk -F= '$1 == "AURUM_CONFIG_REVISION" {print substr($0, index($0, "=") + 1)}'
  )"
fi

worker_was_running=false
if docker compose -f compose.cloud.yml ps --status running --services | grep -qx worker; then
  worker_was_running=true
fi

replacement_started=false
restore_previous_release() {
  exit_code=$?
  trap - EXIT INT TERM
  if [ "$replacement_started" = true ] && [ -n "$previous_image" ]; then
    echo "Deployment failed; restoring previous image" >&2
    AURUM_IMAGE="$previous_image"
    AURUM_GIT_SHA="${previous_git_sha:-rollback}"
    AURUM_CONFIG_REVISION="${previous_config_revision:-rollback}"
    AURUM_WORKER_INSTANCE_ID="rollback-${AURUM_GIT_SHA}-$(date +%s)"
    export AURUM_IMAGE AURUM_GIT_SHA AURUM_CONFIG_REVISION AURUM_WORKER_INSTANCE_ID
    docker compose -f compose.cloud.yml up -d api worker
    worker_was_running=false
  fi
  if [ "$worker_was_running" = true ]; then
    docker compose -f compose.cloud.yml start worker >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap restore_previous_release EXIT INT TERM

export AURUM_IMAGE AURUM_GIT_SHA AURUM_CONFIG_REVISION MIGRATION_DATABASE_URL
AURUM_WORKER_INSTANCE_ID="${AURUM_GIT_SHA}-$(date +%s)"
export AURUM_WORKER_INSTANCE_ID

docker compose -f compose.cloud.yml pull api worker migrate
docker compose -f compose.cloud.yml run --rm api python -m app.cli validate-runtime-db
docker compose -f compose.cloud.yml stop worker
docker compose -f compose.cloud.yml --profile operator run --rm migrate

replacement_started=true
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

revision="$(
  curl -fsS http://127.0.0.1:8000/api/v1/version |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["revision"])'
)"
if [ "$revision" != "$AURUM_GIT_SHA" ]; then
  echo "API revision does not match the deployed commit" >&2
  exit 1
fi

docker compose -f compose.cloud.yml up -d worker

attempt=0
until curl -fsS \
  "http://127.0.0.1:8000/health/worker?worker_id=${AURUM_WORKER_INSTANCE_ID}" \
  >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Replacement worker heartbeat did not become ready" >&2
    exit 1
  fi
  sleep 2
done

curl -fsS "${AURUM_PUBLIC_API_URL%/}/health/ready" >/dev/null

trap - EXIT INT TERM
