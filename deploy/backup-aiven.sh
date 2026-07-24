#!/usr/bin/env sh
set -eu

CDPATH=
APP_DIR=$(cd -- "$(dirname -- "$0")/.." && pwd)
readonly APP_DIR CDPATH

test -f "$APP_DIR/.env.cloud" || {
  echo "Missing $APP_DIR/.env.cloud" >&2
  exit 2
}

set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env.cloud"
set +a

: "${DIRECT_DATABASE_URL:?Set the direct Aiven PostgreSQL URL}"
: "${BACKUP_S3_BUCKET:?Set the versioned backup bucket name}"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
object="s3://${BACKUP_S3_BUCKET}/aurum-cloud/${timestamp}.dump"
pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner --no-acl |
  aws s3 cp - "$object" --sse AES256
echo "Created encrypted backup: $object"
