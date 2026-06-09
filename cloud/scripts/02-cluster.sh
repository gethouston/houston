#!/usr/bin/env bash
# ============================================================================
# 02-cluster.sh — create the GKE Autopilot cluster that runs agent sandboxes.
#
# The cluster is created with:
#   - Autopilot mode (GKE manages nodes; right runtime for per-org isolation)
#   - cluster version >= MIN_CLUSTER_VERSION (Agent Sandbox / gVisor support)
#   - Workload Identity (cluster pulls real keys from Secret Manager without
#     node-mounted service-account keys; matches the control plane keyless design)
#   - Agent Sandbox enabled (gVisor runtimeClass the control plane sets via
#     config.runtimeClass, default "gvisor")
#
# Creating the cluster and enabling Agent Sandbox both BILL, so each is gated
# behind an explicit CONFIRM (skip with --yes). IDEMPOTENT: if the cluster
# already exists we skip create and only reconcile Agent Sandbox.
#
# Required env:
#   PROJECT_ID
#   REGION            e.g. us-central1   (Autopilot is regional, not zonal)
#   CLUSTER_NAME      e.g. houston-control-plane
# Optional env:
#   MIN_CLUSTER_VERSION   default 1.35.2-gke.1269000 (the floor for Agent Sandbox)
#   CLUSTER_VERSION       exact version to pin; default: latest in REGION's
#                         regular channel that is >= MIN_CLUSTER_VERSION
#
# Usage:  ./02-cluster.sh [--yes]
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

parse_common_flags "$@"
require_cmd gcloud
require_env PROJECT_ID REGION CLUSTER_NAME

MIN_CLUSTER_VERSION="${MIN_CLUSTER_VERSION:-1.35.2-gke.1269000}"

# semver_ge "$a" "$b": numeric-aware "a >= b" for GKE versions like
# 1.35.2-gke.1269000. Splits on '.' and '-gke.' into integer fields and
# compares field-by-field. Returns 0 (true) iff a >= b.
semver_ge() {
  local a="${1//-gke./.}" b="${2//-gke./.}"
  local -a fa fb
  IFS='.' read -r -a fa <<<"$a"
  IFS='.' read -r -a fb <<<"$b"
  local i max=${#fa[@]}
  [ "${#fb[@]}" -gt "$max" ] && max=${#fb[@]}
  for ((i = 0; i < max; i++)); do
    local x="${fa[i]:-0}" y="${fb[i]:-0}"
    if ((10#$x > 10#$y)); then return 0; fi
    if ((10#$x < 10#$y)); then return 1; fi
  done
  return 0
}

# Resolve the version to pin. An explicit CLUSTER_VERSION wins (still floor-checked);
# otherwise pick the newest version offered in the regular channel for REGION.
resolve_cluster_version() {
  if [ -n "${CLUSTER_VERSION:-}" ]; then
    printf '%s' "$CLUSTER_VERSION"
    return 0
  fi
  local latest
  latest="$(gcloud container get-server-config \
    --region="$REGION" --project="$PROJECT_ID" \
    --flatten='channels' --filter='channels.channel=REGULAR' \
    --format='value(channels.validVersions[0])' 2>/dev/null || true)"
  [ -n "$latest" ] || die "could not read available cluster versions for region '${REGION}' (is the container API enabled? run ./01-apis.sh)"
  printf '%s' "$latest"
}

log "Cluster: ${CLUSTER_NAME} (region ${REGION}, project ${PROJECT_ID})"

if gcloud container clusters describe "$CLUSTER_NAME" \
  --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  ok "cluster '${CLUSTER_NAME}' already exists — skipping create"
else
  PIN_VERSION="$(resolve_cluster_version)"
  if ! semver_ge "$PIN_VERSION" "$MIN_CLUSTER_VERSION"; then
    die "resolved cluster version '${PIN_VERSION}' is below the Agent Sandbox floor '${MIN_CLUSTER_VERSION}'. Set CLUSTER_VERSION to a newer version or pick a region that offers it."
  fi
  log "pinning cluster version ${PIN_VERSION} (>= ${MIN_CLUSTER_VERSION})"
  run_billed "create GKE Autopilot cluster '${CLUSTER_NAME}' in '${REGION}'" -- \
    gcloud container clusters create-auto "$CLUSTER_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --cluster-version="$PIN_VERSION" \
    --workload-pool="${PROJECT_ID}.svc.id.goog"
  ok "created cluster '${CLUSTER_NAME}'"
fi

# --- Agent Sandbox ---------------------------------------------------------
# Autopilot exposes the gVisor sandbox via the GKE Agent Sandbox add-on. Enabling
# it allocates sandbox-capable capacity, so it is gated as a billed action.
log "Ensuring Agent Sandbox (gVisor) is enabled"
SANDBOX_STATE="$(gcloud container clusters describe "$CLUSTER_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='value(addonsConfig.gcpAgentSandboxConfig.enabled)' 2>/dev/null || true)"

if [ "$SANDBOX_STATE" = "True" ] || [ "$SANDBOX_STATE" = "true" ]; then
  ok "Agent Sandbox already enabled"
else
  run_billed "enable Agent Sandbox (gVisor) on cluster '${CLUSTER_NAME}'" -- \
    gcloud container clusters update "$CLUSTER_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --enable-agent-sandbox
  ok "enabled Agent Sandbox"
fi

# Fetch credentials so 03-verify-sandbox.sh (and the control plane) can talk to it.
run gcloud container clusters get-credentials "$CLUSTER_NAME" \
  --region="$REGION" --project="$PROJECT_ID"

log "Done. Next: ./03-verify-sandbox.sh"
