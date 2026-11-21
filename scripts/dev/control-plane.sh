#!/bin/sh
set -eu
. scripts/dev/env.sh

wait_pg
export CP_DEV_DATA_DIR="${CP_DEV_DATA_DIR:-$HOME/.dev-houston-cloud}"
export CP_DEV_ENGINE_CMD="${CP_DEV_ENGINE_CMD:-HOUSTON_EAGER_RUNTIME=1 HOUSTON_LOOPBACK_EGRESS=1 pnpm --dir '$HOUSTON_DEV_ROOT' --filter @houston/host dev}"
cd "$CLOUD_DIR"
exec go run ./cmd/control-plane
