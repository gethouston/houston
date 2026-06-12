#!/usr/bin/env bash
# ============================================================================
# 01-apis.sh — enable the Google Cloud APIs the control plane control plane needs.
#
#   container.googleapis.com         GKE (Autopilot cluster + Agent Sandbox)
#   artifactregistry.googleapis.com  hosts the agent container image
#   secretmanager.googleapis.com     real provider keys for the keyless proxy
#   storage.googleapis.com           per-agent volume / artifact storage
#
# IDEMPOTENT: enabling an already-enabled service is a no-op, but we still check
# first so the run reads cleanly. Enabling APIs does not itself bill, so these
# are NOT gated behind CONFIRM (the resources created later are).
#
# Required env:
#   PROJECT_ID
#
# Usage:  ./01-apis.sh [--yes]
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

parse_common_flags "$@"
require_cmd gcloud
require_env PROJECT_ID

REQUIRED_APIS=(
  container.googleapis.com
  artifactregistry.googleapis.com
  secretmanager.googleapis.com
  storage.googleapis.com
)

log "Ensuring required APIs are enabled on '${PROJECT_ID}'"

# Snapshot already-enabled services once (cheaper than N describe calls).
ENABLED="$(gcloud services list --enabled --project="$PROJECT_ID" \
  --format='value(config.name)')"

for api in "${REQUIRED_APIS[@]}"; do
  if printf '%s\n' "$ENABLED" | grep -qx "$api"; then
    ok "already enabled: ${api}"
  else
    run gcloud services enable "$api" --project="$PROJECT_ID"
    ok "enabled: ${api}"
  fi
done

log "Done. Next: ./02-cluster.sh"
