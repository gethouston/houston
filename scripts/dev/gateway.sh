#!/bin/sh
set -eu
. scripts/dev/env.sh

GW_CATALOG_PATH="${GW_CATALOG_PATH:-${HOUSTON_HOME:-$HOME/.dev-houston}/gateway-catalog.json}"
export GW_CATALOG_PATH
rm -f "$GW_CATALOG_PATH"
mirror_catalog() {
  gateway_pid=$1
  host_url="${VITE_NEW_ENGINE_URL:-http://127.0.0.1:4318}"
  tmp="$GW_CATALOG_PATH.next"
  while kill -0 "$gateway_pid" 2>/dev/null; do
    if curl -fsS -m 5 "$host_url/v1/catalog" -o "$tmp" 2>/dev/null &&
      ! cmp -s "$tmp" "$GW_CATALOG_PATH"; then
      mv "$tmp" "$GW_CATALOG_PATH"
      echo "[dev] gateway catalog mirrored from $host_url/v1/catalog"
    fi
    sleep 10
  done
  rm -f "$tmp"
}
mirror_catalog $$ &

wait_pg
cd "$CLOUD_DIR"
exec go run ./cmd/gateway
