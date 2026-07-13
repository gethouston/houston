#!/bin/sh
# `pnpm dev` pane: the Go control-plane in DEV-LAUNCHER mode (CP_DEV_LAUNCHER=1
# via .env.development) — agents run as local host processes spawned from THIS
# checkout instead of Kubernetes pods. The launcher supplies each engine's
# HOUSTON_HOST_PORT / HOUSTON_HOST_TOKEN / HOUSTON_HOME / HOUSTON_MANAGED_CLOUD /
# HOUSTON_CODE_EXECUTION; the command below is what it spawns per agent.
set -eu
. scripts/dev/env.sh

wait_pg
# Per-agent engine data lives here, one dir per org/agent (the dev "PVC").
export CP_DEV_DATA_DIR="${CP_DEV_DATA_DIR:-$HOME/.dev-houston-cloud}"
# The engine command mirrors the engine-pod image (selfhost/Dockerfile): the
# host's local main with the managed-cloud profile, eager runtime included.
export CP_DEV_ENGINE_CMD="${CP_DEV_ENGINE_CMD:-HOUSTON_EAGER_RUNTIME=1 pnpm --dir '$HOUSTON_DEV_ROOT' --filter @houston/host dev}"
cd "$CLOUD_DIR"
exec go run ./cmd/control-plane
