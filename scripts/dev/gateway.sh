#!/bin/sh
# `pnpm dev` pane: the Go gateway (authoritative edge) from the sibling cloud
# checkout, on :9080. All GW_*/CP_* config comes from .env.development via the
# shared prelude; ANTHROPIC_API_KEY / COMPOSIO_API_KEY ride in from .env.local
# when present. Real GCIP (Firebase) sign-in — GW_DEV is deliberately NOT set.
# Boot migrations run against the pg pane's database, so wait for it first.
set -eu
. scripts/dev/env.sh

wait_pg
cd "$CLOUD_DIR"
exec go run ./cmd/gateway
