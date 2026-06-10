#!/usr/bin/env bash
# ============================================================================
# 05-code-sandbox.sh — build + deploy the per-task code-execution sandbox to
# Cloud Run (gen2). This is the "rented sandbox" half of the cheap-agent design
# (see cloud/code-execution.md). It is the box where the agent's UNTRUSTED code
# runs; it scales to zero, so it costs ~$0 when no one is running code.
#
# Isolation posture enforced here (Gate #3 closed — no follow-ups):
#   --execution-environment=gen2   per-instance microVM boundary between tenants
#   --concurrency=1                one task per instance at a time (mandatory for
#                                  untrusted code — Cloud Run does NOT isolate
#                                  concurrent requests on one instance)
#   --no-allow-unauthenticated     Cloud Run IAM gate: only identities with
#                                  run.invoker (the runtime's SA) may call it.
#                                  The caller's Google ID token rides
#                                  Authorization; the app token rides
#                                  X-Sandbox-Token (two gates, two headers).
#   SANDBOX_TOKEN (Secret Manager) the app-layer shared secret
#   zero-IAM service account       the sandbox SA holds NO roles. Untrusted code
#                                  CAN reach the metadata server (it is
#                                  link-local, served by the platform, and not
#                                  routable through VPC firewalls) — so the
#                                  token it can mint must be worth nothing.
#   Direct VPC + deny-all egress   ALL outbound traffic routes into a dedicated
#                                  VPC whose only firewall rule denies egress.
#                                  No exfiltration channel, no RFC1918 pivot,
#                                  no pip install at runtime (deps are baked
#                                  into the image; see requirements.txt).
#   fresh /tmp workdir per request the service wipes state between runs
#
# Usage:
#   export PROJECT_ID=gethouston REGION=us-east1
#   export RUNTIME_INVOKER_SA=houston-runtime@gethouston.iam.gserviceaccount.com
#   ./cloud/scripts/05-code-sandbox.sh           # prompts before each billed step
#   ./cloud/scripts/05-code-sandbox.sh --yes      # CI / non-interactive
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"
parse_common_flags "$@"

require_cmd gcloud
require_env PROJECT_ID REGION

SERVICE="${SANDBOX_SERVICE:-houston-code-sandbox}"
REPO="${ARTIFACT_REPO:-houston}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/code-sandbox:${SANDBOX_TAG:-v2}"
SECRET="${SANDBOX_TOKEN_SECRET:-houston-code-sandbox-token}"
SA_NAME="${SANDBOX_SA_NAME:-houston-code-sandbox}"
SERVICE_ACCOUNT="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
NETWORK="${SANDBOX_NETWORK:-code-sandbox-net}"
SUBNET="${SANDBOX_SUBNET:-code-sandbox-egress}"
SUBNET_RANGE="${SANDBOX_SUBNET_RANGE:-10.190.0.0/26}"
# Repo ROOT is the docker build context (the Dockerfile COPYs packages/code-sandbox/*).
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log "Project ${PROJECT_ID} / region ${REGION}"
log "Service ${SERVICE}  image ${IMAGE}"

# 1. Zero-IAM service account. The sandbox CAN mint this SA's tokens via the
#    link-local metadata server (a VPC firewall cannot block that path), so the
#    SA must hold no roles at all — a stolen token opens nothing.
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  run gcloud iam service-accounts create "${SA_NAME}" \
    --project "${PROJECT_ID}" \
    --display-name "Houston code sandbox (zero IAM — holds no roles by design)"
fi
ROLES="$(gcloud projects get-iam-policy "${PROJECT_ID}" \
  --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:${SERVICE_ACCOUNT}" \
  --format='value(bindings.role)' 2>/dev/null || true)"
if [ -n "${ROLES}" ]; then
  die "the sandbox SA ${SERVICE_ACCOUNT} holds project roles (${ROLES//$'\n'/, }) — remove them; this SA must stay zero-IAM"
fi
ok "sandbox service account is zero-IAM"

# 2. Dedicated VPC whose ONLY firewall rule is deny-all egress. With
#    --vpc-egress=all-traffic every outbound packet from the service routes
#    here and dies; replies to inbound HTTP still flow (stateful firewall).
if ! gcloud compute networks describe "${NETWORK}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  run gcloud compute networks create "${NETWORK}" \
    --project "${PROJECT_ID}" --subnet-mode=custom
fi
if ! gcloud compute networks subnets describe "${SUBNET}" --project "${PROJECT_ID}" --region "${REGION}" >/dev/null 2>&1; then
  run gcloud compute networks subnets create "${SUBNET}" \
    --project "${PROJECT_ID}" \
    --network "${NETWORK}" \
    --region "${REGION}" \
    --range "${SUBNET_RANGE}"
fi
if ! gcloud compute firewall-rules describe code-sandbox-deny-all-egress --project "${PROJECT_ID}" >/dev/null 2>&1; then
  run gcloud compute firewall-rules create code-sandbox-deny-all-egress \
    --project "${PROJECT_ID}" \
    --network "${NETWORK}" \
    --direction=EGRESS \
    --action=DENY \
    --rules=all \
    --destination-ranges=0.0.0.0/0 \
    --priority=1000
fi
ok "VPC ${NETWORK} ready with deny-all egress"

# 3. Build the image with Cloud Build (no local Docker needed).
run_billed "Cloud Build of the code-sandbox image" -- \
  gcloud builds submit "${REPO_ROOT}" \
    --project "${PROJECT_ID}" \
    --tag "${IMAGE}" \
    --gcs-log-dir "gs://${PROJECT_ID}_cloudbuild/logs"

# 4. Ensure the app-layer token secret exists (operator creates the value once).
if ! gcloud secrets describe "${SECRET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  warn "Secret '${SECRET}' not found. Create it once with a random token, e.g.:"
  warn "  openssl rand -hex 32 | gcloud secrets create ${SECRET} --project ${PROJECT_ID} --data-file=-"
  die "create the sandbox token secret, then re-run"
fi
run gcloud secrets add-iam-policy-binding "${SECRET}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role roles/secretmanager.secretAccessor

# 5. Deploy with the full untrusted-code isolation posture.
run_billed "Deploy ${SERVICE} to Cloud Run (gen2, concurrency=1, locked egress)" -- \
  gcloud run deploy "${SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --image "${IMAGE}" \
    --execution-environment gen2 \
    --no-allow-unauthenticated \
    --concurrency 1 \
    --cpu 1 \
    --memory 1Gi \
    --timeout 120 \
    --min-instances 0 \
    --max-instances "${SANDBOX_MAX_INSTANCES:-50}" \
    --service-account "${SERVICE_ACCOUNT}" \
    --network "${NETWORK}" \
    --subnet "${SUBNET}" \
    --vpc-egress all-traffic \
    --set-secrets "SANDBOX_TOKEN=${SECRET}:latest"

# 6. IAM ingress: only the runtime's service account may invoke the sandbox.
if [ -n "${RUNTIME_INVOKER_SA:-}" ]; then
  run gcloud run services add-iam-policy-binding "${SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --member "serviceAccount:${RUNTIME_INVOKER_SA}" \
    --role roles/run.invoker
  ok "run.invoker granted to ${RUNTIME_INVOKER_SA}"
else
  warn "RUNTIME_INVOKER_SA not set — no identity can invoke the sandbox yet."
  warn "Re-run with RUNTIME_INVOKER_SA=<runtime SA email> after 06-runtime.sh."
fi

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
ok "Deployed. Sandbox URL: ${URL}"
log "Wire the runtime to it:"
log "  HOUSTON_CODE_SANDBOX_URL=${URL}"
log "  HOUSTON_CODE_SANDBOX_TOKEN=<the value stored in secret '${SECRET}'>"
log "Note: pip install at runtime is intentionally dead (no egress). Bake deps"
log "into packages/code-sandbox/requirements.txt and redeploy instead."