#!/usr/bin/env bash
# ============================================================================
# 06-runtime.sh — deploy the per-turn agent runtime to Cloud Run.
#
# This is the cloud hosting layer: agents are GCS prefixes; a turn is ONE
# request (hydrate → run pi → sync back → wipe). Idle agents cost $0 compute.
#
# Posture:
#   --no-allow-unauthenticated   only the control plane's SA (run.invoker) may
#                                call it; its ID token rides Authorization and
#                                the app token rides X-Internal-Token.
#   --concurrency=1              one tenant per instance at a time — the same
#                                no-co-residency property as the code sandbox.
#   dedicated SA                 objectAdmin on the workspaces bucket ONLY
#                                (+ run.invoker on the code sandbox, granted by
#                                05-code-sandbox.sh via RUNTIME_INVOKER_SA).
#
# Usage:
#   export PROJECT_ID=gethouston REGION=us-east1
#   export CP_INVOKER_SA=<the control plane's GSA email>      # for run.invoker
#   ./cloud/scripts/06-runtime.sh [--yes]
#
# Afterwards set on the control plane:
#   CP_TURN_RUNTIME_URL=<printed URL>   CP_TURN_TOKEN=<houston-turn-token value>
#   CP_GCS_BUCKET=<bucket>              CP_DEFAULT_RUNTIME=cloudrun
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"
parse_common_flags "$@"

require_cmd gcloud
require_env PROJECT_ID REGION

SERVICE="${TURN_SERVICE:-houston-turn-runtime}"
REPO="${ARTIFACT_REPO:-houston}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/runtime:${RUNTIME_TAG:-v6}"
BUCKET="${WORKSPACES_BUCKET:-${PROJECT_ID}-workspaces}"
TURN_SECRET="${TURN_TOKEN_SECRET:-houston-turn-token}"
SANDBOX_SECRET="${SANDBOX_TOKEN_SECRET:-houston-code-sandbox-token}"
SA_NAME="${RUNTIME_SA_NAME:-houston-runtime}"
SERVICE_ACCOUNT="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log "Project ${PROJECT_ID} / region ${REGION}"
log "Service ${SERVICE}  image ${IMAGE}  bucket gs://${BUCKET}"

# 1. Runtime service account: object access to the workspaces bucket ONLY.
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  run gcloud iam service-accounts create "${SA_NAME}" \
    --project "${PROJECT_ID}" \
    --display-name "Houston per-turn runtime (bucket-scoped object access only)"
fi

# 2. Workspaces bucket: uniform access, public access prevented, same region.
if ! gcloud storage buckets describe "gs://${BUCKET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  run_billed "Create the workspaces bucket gs://${BUCKET}" -- \
    gcloud storage buckets create "gs://${BUCKET}" \
      --project "${PROJECT_ID}" \
      --location "${REGION}" \
      --uniform-bucket-level-access \
      --public-access-prevention
fi
run gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role roles/storage.objectAdmin

# 3. App-layer turn token secret (operator creates the value once).
if ! gcloud secrets describe "${TURN_SECRET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  warn "Secret '${TURN_SECRET}' not found. Create it once with a random token, e.g.:"
  warn "  openssl rand -hex 32 | gcloud secrets create ${TURN_SECRET} --project ${PROJECT_ID} --data-file=-"
  die "create the turn token secret, then re-run"
fi
run gcloud secrets add-iam-policy-binding "${TURN_SECRET}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role roles/secretmanager.secretAccessor
run gcloud secrets add-iam-policy-binding "${SANDBOX_SECRET}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role roles/secretmanager.secretAccessor

# 4. Build the runtime image (same image as the GKE pods; mode is env-selected).
run_billed "Cloud Build of the runtime image" -- \
  gcloud builds submit "${REPO_ROOT}" \
    --project "${PROJECT_ID}" \
    --config /dev/stdin <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args: ["build", "-t", "${IMAGE}", "-f", "packages/runtime/Dockerfile", "."]
images: ["${IMAGE}"]
options: { machineType: E2_HIGHCPU_8 }
timeout: 1800s
EOF

# 5. The code sandbox URL this runtime calls (deployed by 05-code-sandbox.sh).
SANDBOX_URL="$(gcloud run services describe "${SANDBOX_SERVICE:-houston-code-sandbox}" \
  --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)' 2>/dev/null || true)"
if [ -z "${SANDBOX_URL}" ]; then
  warn "code sandbox service not found — run_code will be unavailable until 05-code-sandbox.sh runs"
fi

# 6. Deploy. Turn duration is bounded by --timeout (a turn is 30–120 s typical).
run_billed "Deploy ${SERVICE} to Cloud Run (per-turn, concurrency=1, scale-to-zero)" -- \
  gcloud run deploy "${SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --image "${IMAGE}" \
    --execution-environment gen2 \
    --no-allow-unauthenticated \
    --concurrency 1 \
    --cpu 1 \
    --memory 1Gi \
    --timeout 900 \
    --min-instances 0 \
    --max-instances "${TURN_MAX_INSTANCES:-100}" \
    --service-account "${SERVICE_ACCOUNT}" \
    --set-env-vars "HOUSTON_MODE=turn,HOUSTON_GCS_BUCKET=${BUCKET},HOUSTON_HOST=0.0.0.0,HOUSTON_PORT=8080,HOUSTON_CODE_SANDBOX_URL=${SANDBOX_URL}" \
    --set-secrets "HOUSTON_TURN_TOKEN=${TURN_SECRET}:latest,HOUSTON_CODE_SANDBOX_TOKEN=${SANDBOX_SECRET}:latest"

# 7. Ingress IAM: only the control plane may invoke turns.
if [ -n "${CP_INVOKER_SA:-}" ]; then
  run gcloud run services add-iam-policy-binding "${SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --member "serviceAccount:${CP_INVOKER_SA}" \
    --role roles/run.invoker
  ok "run.invoker granted to ${CP_INVOKER_SA}"
else
  warn "CP_INVOKER_SA not set — the control plane cannot invoke the runtime yet."
fi

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
ok "Deployed. Turn runtime URL: ${URL}"
log "Set on the control plane:"
log "  CP_TURN_RUNTIME_URL=${URL}"
log "  CP_TURN_TOKEN=<value of secret '${TURN_SECRET}'>"
log "  CP_GCS_BUCKET=${BUCKET}"
log "  CP_DEFAULT_RUNTIME=cloudrun"
log "Then grant the SANDBOX invoker to this runtime (05-code-sandbox.sh):"
log "  RUNTIME_INVOKER_SA=${SERVICE_ACCOUNT} ./cloud/scripts/05-code-sandbox.sh --yes"