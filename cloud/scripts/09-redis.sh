#!/usr/bin/env bash
# ============================================================================
# 09-redis.sh — provision the Memorystore (Redis) instance behind the control
# plane's shared turn-state bus, unlocking `replicas: 2+`.
#
# What rides this bus (packages/host/src/turn/bus.ts):
#   - relay event fan-out + snapshots (SSE on replica B sees a turn on A)
#   - the one-turn-per-agent mutex (lease + cross-replica cancel)
#   - per-workspace turn-quota counters
#   - device-code connect state
#
# BILLED: a 1 GiB basic-tier Memorystore instance runs ~$35/mo in us-east1.
# The instance lives on the VPC the GKE cluster uses (direct peering), so the
# control plane reaches it over private IP with no auth proxy.
#
# Usage:
#   export PROJECT_ID=gethouston REGION=us-east1
#   ./cloud/scripts/09-redis.sh [--yes]
#
# Afterwards:
#   kubectl -n houston-system create secret generic control-plane-secrets \
#     --from-literal=redis-url="redis://<printed-host>:<printed-port>" --dry-run=client -o yaml \
#     | kubectl apply -f -        # (or patch the existing secret)
#   then set `replicas: 2` in cloud/k8s/control-plane.yaml and apply.
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

parse_common_flags "$@"
require_cmd gcloud
require_env PROJECT_ID
REGION="${REGION:-us-east1}"
INSTANCE="${INSTANCE:-houston-cp-bus}"
NETWORK="${NETWORK:-default}"

log "Enabling the Memorystore API"
run gcloud services enable redis.googleapis.com --project "${PROJECT_ID}"

if gcloud redis instances describe "${INSTANCE}" --region "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  ok "Memorystore instance ${INSTANCE} already exists — skipping create"
else
  confirm "Create Memorystore Redis '${INSTANCE}' (1 GiB basic, ~\$35/mo) in ${REGION}?"
  run_billed gcloud redis instances create "${INSTANCE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --size 1 \
    --tier basic \
    --redis-version redis_7_0 \
    --network "projects/${PROJECT_ID}/global/networks/${NETWORK}" \
    --connect-mode DIRECT_PEERING
fi

HOST="$(gcloud redis instances describe "${INSTANCE}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(host)')"
PORT="$(gcloud redis instances describe "${INSTANCE}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(port)')"

cat <<EOF

${C_GRN}Memorystore ready.${C_RST}
  CP_REDIS_URL=redis://${HOST}:${PORT}

Next:
  1. Add it to the control-plane secret:
       kubectl -n houston-system patch secret control-plane-secrets \\
         -p '{"stringData":{"redis-url":"redis://${HOST}:${PORT}"}}'
  2. Set replicas: 2 in cloud/k8s/control-plane.yaml and: kubectl apply -f cloud/k8s/control-plane.yaml
  3. Watch the rollout: kubectl -n houston-system rollout status deploy/control-plane
EOF
ok "done"
