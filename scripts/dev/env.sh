#!/bin/sh

HOUSTON_DEV_ROOT="$(pwd)"
CLOUD_DIR="${CLOUD_DIR:-$(cd "$HOUSTON_DEV_ROOT/.." && pwd)/cloud}"
export HOUSTON_DEV_ROOT CLOUD_DIR

set -a
[ -f "$HOUSTON_DEV_ROOT/.env.development" ] && . "$HOUSTON_DEV_ROOT/.env.development"
[ -f "$HOUSTON_DEV_ROOT/.env.local" ] && . "$HOUSTON_DEV_ROOT/.env.local"
set +a

wait_pg() {
  printf 'waiting for postgres (houston-dev-pg)'
  i=0
  until docker exec houston-dev-pg pg_isready -U postgres -q 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 120 ]; then
      printf '\npostgres did not become ready in 120s — check the pg pane\n' >&2
      exit 1
    fi
    printf '.'
    sleep 1
  done
  printf ' ready\n'
}
