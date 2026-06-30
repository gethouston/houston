#!/usr/bin/env bash
# Houston GCP POC — deploy to houston-cloud cluster, namespace houston-poc.
# Run from the MONOREPO ROOT:  bash cloud/k8s/gcp-poc/deploy.sh
#
# Architecture:
#   - GKE cluster: houston-cloud (us-east1)
#   - Namespace: houston-poc
#   - Static IP: 34.117.171.155 (houston-poc-ip)
#   - Domains: poc.gethouston.ai / poc-api.gethouston.ai
#   - TLS: GCP ManagedCertificate (auto-provisions once DNS resolves)
#   - Services: NodePort → GCE Ingress (no LoadBalancer per service)
#   - Auth: Supabase SSO (Google OAuth) — project bnveorwpnaepkdchqgzh
#
# DNS (must be added in Cloudflare before TLS provisions):
#   poc      A  34.117.171.155  (DNS only, no proxy)
#   poc-api  A  34.117.171.155  (DNS only, no proxy)
#
# USAGE
#   Full deploy (builds + pushes images, deploys everything):
#     ANTHROPIC_API_KEY=sk-ant-... bash cloud/k8s/gcp-poc/deploy.sh
#
#   Update only (skip IAM/Postgres/migrations, just rebuild + redeploy):
#     ANTHROPIC_API_KEY=sk-ant-... bash cloud/k8s/gcp-poc/deploy.sh --update
#
# Rerunnable: kubectl apply is idempotent.
# Teardown:   kubectl delete namespace houston-poc

set -euo pipefail

GCP_PROJECT="gethouston"
REGION="us-east1"
REGISTRY="${REGION}-docker.pkg.dev/${GCP_PROJECT}/houston"
CLUSTER_CONTEXT="gke_${GCP_PROJECT}_${REGION}_houston-cloud"
POC_DIR="cloud/k8s/gcp-poc"
NAMESPACE="houston-poc"
GCP_SA="houston-control-plane@${GCP_PROJECT}.iam.gserviceaccount.com"
FRONTEND_TAG="${REGISTRY}/frontend:poc"
CP_TAG="${REGISTRY}/control-plane:poc"
STATIC_IP="34.117.171.155"
FRONTEND_DOMAIN="poc.gethouston.ai"
CP_DOMAIN="poc-api.gethouston.ai"
UPDATE_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --update) UPDATE_ONLY=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

echo "=== Houston GCP POC — $([ "$UPDATE_ONLY" = true ] && echo "update" || echo "full deploy") ==="
echo "Cluster:   ${CLUSTER_CONTEXT}"
echo "Namespace: ${NAMESPACE}"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
for cmd in kubectl gcloud docker pnpm; do
  command -v "$cmd" &>/dev/null || { echo "ERROR: $cmd not found"; exit 1; }
done

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "⚠  ANTHROPIC_API_KEY not set — agents won't call Claude"
  echo "   Re-run with: ANTHROPIC_API_KEY=sk-ant-... bash $0 $([ "$UPDATE_ONLY" = true ] && echo "--update")"
  echo ""
fi

kubectl config use-context "${CLUSTER_CONTEXT}"

# ── 1. IAM + Workload Identity ────────────────────────────────────────────────
if [ "$UPDATE_ONLY" = false ]; then
  echo "→ granting GCS access to control-plane SA..."
  gcloud storage buckets add-iam-policy-binding gs://gethouston-poc-workspaces \
    --member="serviceAccount:${GCP_SA}" \
    --role="roles/storage.objectAdmin" \
    --project "${GCP_PROJECT}" > /dev/null

  echo "→ binding Workload Identity..."
  gcloud iam service-accounts add-iam-policy-binding "${GCP_SA}" \
    --role roles/iam.workloadIdentityUser \
    --member "serviceAccount:${GCP_PROJECT}.svc.id.goog[${NAMESPACE}/control-plane]" \
    --project "${GCP_PROJECT}" 2>/dev/null || echo "  (binding already exists)"
fi

# ── 2. Namespace + Postgres + migrations ──────────────────────────────────────
if [ "$UPDATE_ONLY" = false ]; then
  echo "→ applying namespace..."
  kubectl apply -f "${POC_DIR}/namespace.yaml"

  echo "→ deploying Postgres..."
  kubectl apply -f "${POC_DIR}/postgres.yaml"
  kubectl -n "${NAMESPACE}" wait --for=condition=ready pod \
    --selector=app=postgres --timeout=120s

  echo "→ running migrations..."
  kubectl -n "${NAMESPACE}" delete job houston-migrations --ignore-not-found
  kubectl apply -f "${POC_DIR}/migrations-job.yaml"
  kubectl -n "${NAMESPACE}" wait --for=condition=complete job/houston-migrations \
    --timeout=60s
  echo "✓ migrations done"
fi

# ── 3. Build + push control-plane ─────────────────────────────────────────────
echo "→ building control-plane image (linux/amd64)..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build \
  --platform linux/amd64 \
  -t "${CP_TAG}" \
  -f packages/host-cloud/Dockerfile \
  .
echo "→ pushing ${CP_TAG}..."
docker push "${CP_TAG}"

# ── 4. Build + push frontend ──────────────────────────────────────────────────
echo "→ building web frontend..."
VITE_CONTROL_PLANE_URL="https://${CP_DOMAIN}" \
  pnpm --filter houston-web build

echo "→ building frontend image (linux/amd64)..."
docker build \
  --platform linux/amd64 \
  -t "${FRONTEND_TAG}" \
  -f "cloud/k8s/poc/frontend.Dockerfile" \
  .
echo "→ pushing ${FRONTEND_TAG}..."
docker push "${FRONTEND_TAG}"

# ── 5. Deploy control-plane ────────────────────────────────────────────────────
echo "→ deploying control-plane..."
kubectl apply -f "${POC_DIR}/control-plane.yaml"
kubectl -n "${NAMESPACE}" rollout restart deployment/control-plane
kubectl -n "${NAMESPACE}" wait --for=condition=available deployment/control-plane \
  --timeout=120s

# ── 6. Seed Anthropic API key ─────────────────────────────────────────────────
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "→ seeding Anthropic API key into all workspaces..."
  kubectl -n "${NAMESPACE}" exec postgres-0 -- \
    psql -U houston houston -c \
    "INSERT INTO workspace_credentials (workspace_id, provider, access_token, refresh_token, account_id, expires_at, updated_at)
     SELECT id, 'anthropic', '${ANTHROPIC_API_KEY}', '', NULL, 0, 0 FROM workspaces
     ON CONFLICT (workspace_id, provider) DO UPDATE SET access_token = EXCLUDED.access_token, updated_at = 0;" \
    > /dev/null
  echo "✓ Anthropic key seeded"
fi

# ── 7. Deploy frontend ─────────────────────────────────────────────────────────
echo "→ deploying frontend..."
sed "s|FRONTEND_IMAGE_PLACEHOLDER|${FRONTEND_TAG}|g" \
  "${POC_DIR}/frontend.yaml" | kubectl apply -f -
kubectl -n "${NAMESPACE}" rollout restart deployment/frontend
kubectl -n "${NAMESPACE}" wait --for=condition=available deployment/frontend \
  --timeout=60s

# ── 8. Ingress + ManagedCertificate ───────────────────────────────────────────
if [ "$UPDATE_ONLY" = false ]; then
  echo "→ applying ingress + managed certificate..."
  kubectl apply -f "${POC_DIR}/ingress.yaml"
fi

# ── 9. Status ─────────────────────────────────────────────────────────────────
echo ""
CERT_STATUS=$(kubectl -n "${NAMESPACE}" get managedcertificate houston-poc-cert \
  -o jsonpath='{.status.certificateStatus}' 2>/dev/null || echo "unknown")

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Houston GCP POC deployed                               ║"
echo "║                                                          ║"
echo "║  Frontend:  https://${FRONTEND_DOMAIN}             ║"
echo "║  API:       https://${CP_DOMAIN}         ║"
echo "║  Static IP: ${STATIC_IP}                       ║"
echo "║                                                          ║"
printf "║  TLS cert: %-45s ║\n" "${CERT_STATUS}"
echo "║                                                          ║"
echo "║  DNS (add in Cloudflare if not done):                   ║"
echo "║    poc      A  ${STATIC_IP}  (DNS only)          ║"
echo "║    poc-api  A  ${STATIC_IP}  (DNS only)          ║"
echo "║                                                          ║"
echo "║  Watch cert:                                             ║"
echo "║    kubectl -n houston-poc get managedcertificate -w     ║"
echo "║  Watch agent pods:                                       ║"
echo "║    kubectl get pods -A | grep poc-ws-                   ║"
echo "║  CP logs:                                                ║"
echo "║    kubectl -n houston-poc logs -f deploy/control-plane  ║"
echo "╚══════════════════════════════════════════════════════════╝"

if [ "${CERT_STATUS}" != "Active" ]; then
  echo ""
  echo "⏳  TLS cert is '${CERT_STATUS}' — HTTPS won't work until it's Active."
  echo "    This requires DNS to resolve first (Cloudflare records above)."
  echo "    Check progress: kubectl -n houston-poc get managedcertificate -w"
fi
