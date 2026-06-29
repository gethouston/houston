#!/usr/bin/env bash
# Houston GCP POC — deploy to houston-cloud cluster, namespace houston-poc.
# Run from the MONOREPO ROOT:  bash cloud/k8s/gcp-poc/deploy.sh
#
# What it does:
#   Phase 1 — infra
#     1. Bind Workload Identity for POC service account
#     2. Deploy namespace + Postgres, run migrations
#     3. Deploy control-plane (LoadBalancer) + wait for external IP
#   Phase 2 — frontend
#     4. Build web with VITE_CONTROL_PLANE_URL=http://<CP-IP>
#     5. Push frontend image to Artifact Registry
#     6. Deploy frontend (LoadBalancer) + wait for external IP
#     7. Update CP CORS to allow the frontend origin
#
# Rerunnable: existing resources are updated in-place (kubectl apply).
# To tear down:  kubectl delete namespace houston-poc

set -euo pipefail

GCP_PROJECT="gethouston"
REGION="us-east1"
REGISTRY="${REGION}-docker.pkg.dev/${GCP_PROJECT}/houston"
CLUSTER_CONTEXT="gke_${GCP_PROJECT}_${REGION}_houston-cloud"
POC_DIR="cloud/k8s/gcp-poc"
NAMESPACE="houston-poc"
GCP_SA="houston-control-plane@${GCP_PROJECT}.iam.gserviceaccount.com"
FRONTEND_TAG="${REGISTRY}/web:poc"
CP_TAG="${REGISTRY}/control-plane:poc"

echo "=== Houston GCP POC deploy ==="
echo "Cluster:   ${CLUSTER_CONTEXT}"
echo "Namespace: ${NAMESPACE}"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
for cmd in kubectl gcloud docker pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd not found."
    exit 1
  fi
done

kubectl config use-context "${CLUSTER_CONTEXT}"

# ── 1. IAM + Workload Identity ────────────────────────────────────────────────
# Grant control-plane SA access to the POC GCS bucket (idempotent).
echo "→ granting GCS access to control-plane SA..."
gcloud storage buckets add-iam-policy-binding gs://gethouston-poc-workspaces \
  --member="serviceAccount:${GCP_SA}" \
  --role="roles/storage.objectAdmin" \
  --project "${GCP_PROJECT}" > /dev/null

# ── Workload Identity binding ─────────────────────────────────────────────────
echo "→ binding Workload Identity for ${NAMESPACE}/control-plane..."
gcloud iam service-accounts add-iam-policy-binding "${GCP_SA}" \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${GCP_PROJECT}.svc.id.goog[${NAMESPACE}/control-plane]" \
  --project "${GCP_PROJECT}" 2>/dev/null || echo "  (binding already exists)"

# ── 2. Namespace + Postgres ────────────────────────────────────────────────────
echo "→ applying namespace..."
kubectl apply -f "${POC_DIR}/namespace.yaml"

echo "→ deploying Postgres..."
kubectl apply -f "${POC_DIR}/postgres.yaml"
kubectl -n "${NAMESPACE}" wait --for=condition=ready pod \
  --selector=app=postgres --timeout=120s

# ── 3. Migrations ──────────────────────────────────────────────────────────────
echo "→ running migrations..."
# Delete completed/failed job so we can re-apply (jobs are immutable).
kubectl -n "${NAMESPACE}" delete job houston-migrations --ignore-not-found
kubectl apply -f "${POC_DIR}/migrations-job.yaml"
kubectl -n "${NAMESPACE}" wait --for=condition=complete job/houston-migrations \
  --timeout=60s
echo "✓ migrations done"

# ── 4. Build + push control-plane image ────────────────────────────────────────
echo "→ building control-plane image..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build \
  --platform linux/amd64 \
  -t "${CP_TAG}" \
  -f packages/host-cloud/Dockerfile \
  .
echo "→ pushing control-plane image..."
docker push "${CP_TAG}"

# ── 5. Deploy control-plane ────────────────────────────────────────────────────
echo "→ deploying control-plane..."
kubectl apply -f "${POC_DIR}/control-plane.yaml"
kubectl -n "${NAMESPACE}" wait --for=condition=available deployment/control-plane \
  --timeout=120s

echo "→ waiting for control-plane LoadBalancer IP (may take ~60s)..."
CP_IP=""
for i in $(seq 1 30); do
  CP_IP=$(kubectl -n "${NAMESPACE}" get svc control-plane \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [[ -n "${CP_IP}" ]]; then
    echo "✓ control-plane IP: ${CP_IP}"
    break
  fi
  echo "  waiting... (${i}/30)"
  sleep 5
done

if [[ -z "${CP_IP}" ]]; then
  echo "ERROR: timed out waiting for control-plane LoadBalancer IP."
  echo "Check: kubectl -n ${NAMESPACE} get svc control-plane"
  exit 1
fi

CP_URL="http://${CP_IP}"

# ── 6. Build + push frontend ──────────────────────────────────────────────────
echo ""
echo "→ building web frontend (VITE_CONTROL_PLANE_URL=${CP_URL})..."

# VITE_CP_DEV_TOKEN must match CP_SERVICE_TOKENS in control-plane.yaml.
VITE_CONTROL_PLANE_URL="${CP_URL}" \
VITE_CP_DEV_TOKEN="houston-poc-gcp-service-token-2026" \
  pnpm --filter houston-web build

echo "→ building frontend Docker image..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build \
  --platform linux/amd64 \
  -t "${FRONTEND_TAG}" \
  -f "cloud/k8s/poc/frontend.Dockerfile" \
  .

echo "→ pushing frontend image to ${FRONTEND_TAG}..."
docker push "${FRONTEND_TAG}"

# ── 7. Deploy frontend ────────────────────────────────────────────────────────
echo "→ deploying frontend..."
sed "s|FRONTEND_IMAGE_PLACEHOLDER|${FRONTEND_TAG}|g" \
  "${POC_DIR}/frontend.yaml" | kubectl apply -f -
kubectl -n "${NAMESPACE}" wait --for=condition=available deployment/frontend \
  --timeout=60s

echo "→ waiting for frontend LoadBalancer IP..."
FRONTEND_IP=""
for i in $(seq 1 30); do
  FRONTEND_IP=$(kubectl -n "${NAMESPACE}" get svc frontend \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [[ -n "${FRONTEND_IP}" ]]; then
    echo "✓ frontend IP: ${FRONTEND_IP}"
    break
  fi
  echo "  waiting... (${i}/30)"
  sleep 5
done

# ── 8. Update CORS on control-plane ───────────────────────────────────────────
if [[ -n "${FRONTEND_IP}" ]]; then
  echo "→ updating CP_CORS_ORIGIN to http://${FRONTEND_IP}..."
  kubectl -n "${NAMESPACE}" set env deployment/control-plane \
    "CP_CORS_ORIGIN=http://${FRONTEND_IP}"
fi

# ── Health check ──────────────────────────────────────────────────────────────
echo ""
echo "→ checking control-plane health..."
if curl -sf --max-time 10 "${CP_URL}/health" | grep -q ok; then
  echo "✓ control-plane healthy"
else
  echo "⚠ /health check failed — check logs:"
  echo "  kubectl -n ${NAMESPACE} logs deployment/control-plane"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Houston GCP POC is up                                          ║"
echo "║                                                                  ║"
printf  "║  Frontend:      http://%-43s ║\n" "${FRONTEND_IP}"
printf  "║  Control plane: ${CP_URL}%-$((43 - ${#CP_URL}))s ║\n" ""
echo "║                                                                  ║"
echo "║  Dev token (pre-loaded in UI):                                  ║"
echo "║    houston-poc-gcp-service-token-2026                           ║"
echo "║                                                                  ║"
echo "║  Watch agent pods:                                               ║"
echo "║    kubectl get pods -A -w | grep poc-ws-                        ║"
echo "║  Control-plane logs:                                             ║"
printf  "║    kubectl -n %s logs -f deployment/control-plane  ║\n" "${NAMESPACE}"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "To switch to Supabase auth (after adding the frontend IP to Supabase):"
echo "  kubectl -n ${NAMESPACE} create secret generic supabase-creds \\"
echo "    --from-literal=jwks-url=https://<project>.supabase.co/auth/v1/.well-known/jwks.json \\"
echo "    --from-literal=jwt-issuer=https://<project>.supabase.co/auth/v1"
echo "  kubectl -n ${NAMESPACE} set env deployment/control-plane \\"
echo "    CP_SERVICE_TOKENS- \\"
echo "    CP_SUPABASE_JWKS_URL=https://<project>.supabase.co/auth/v1/.well-known/jwks.json \\"
echo "    CP_SUPABASE_JWT_ISSUER=https://<project>.supabase.co/auth/v1"
