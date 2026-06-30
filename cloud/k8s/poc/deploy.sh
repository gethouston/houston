#!/usr/bin/env bash
# Houston kind POC — end-to-end deploy script.
# Run from the MONOREPO ROOT:  bash cloud/k8s/poc/deploy.sh
#
# What it does:
#   1. Creates a kind cluster (houston) with ingress port mapping
#   2. Installs NGINX ingress controller
#   3. Builds the 3 images (engine-pod, control-plane, frontend)
#   4. Loads images into kind (no registry needed)
#   5. Deploys Postgres + runs migrations
#   6. Deploys control-plane + frontend
#   7. Applies ingress
#   8. Health-checks everything
#
# After the script:  open http://localhost:8080
# Token baked into the frontend: poc-dev-token (mapped to user 00000000-…-0001)

set -euo pipefail

CLUSTER_NAME="houston"
POC_DIR="cloud/k8s/poc"

echo "=== Houston kind POC deploy ==="

# ── Prerequisites ────────────────────────────────────────────────────────────
for cmd in kind kubectl docker pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd not found. Install it and retry."
    exit 1
  fi
done

# ── 1. Kind cluster ──────────────────────────────────────────────────────────
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "✓ kind cluster '${CLUSTER_NAME}' already exists"
else
  echo "→ creating kind cluster '${CLUSTER_NAME}'..."
  kind create cluster --name "${CLUSTER_NAME}" --config "${POC_DIR}/kind-config.yaml"
fi

kubectl config use-context "kind-${CLUSTER_NAME}"

# ── 2. NGINX ingress controller ──────────────────────────────────────────────
if kubectl -n ingress-nginx get deployment ingress-nginx-controller &>/dev/null; then
  echo "✓ NGINX ingress already installed"
else
  echo "→ installing NGINX ingress for kind..."
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
  echo "→ waiting for ingress controller to be ready..."
  kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s
fi

# ── 3. Build images ──────────────────────────────────────────────────────────
echo "→ building engine-pod image..."
docker build \
  -t houston/engine-pod:local \
  -f cloud/k8s/poc/engine-pod.Dockerfile \
  .

echo "→ building control-plane image..."
docker build \
  -t houston/control-plane:local \
  -f packages/host-cloud/Dockerfile \
  .

echo "→ building web frontend..."
VITE_CONTROL_PLANE_URL=http://localhost:9080 \
VITE_CP_DEV_TOKEN=houston-poc-dev-token-for-kind-deploy-2026 \
  pnpm --filter houston-web build

echo "→ building frontend nginx image..."
docker build \
  -t houston/frontend:local \
  -f "${POC_DIR}/frontend.Dockerfile" \
  .

# ── 4. Load images into kind ─────────────────────────────────────────────────
echo "→ loading images into kind..."
kind load docker-image houston/engine-pod:local --name "${CLUSTER_NAME}"
kind load docker-image houston/control-plane:local --name "${CLUSTER_NAME}"
kind load docker-image houston/frontend:local --name "${CLUSTER_NAME}"

# ── 5. Postgres ───────────────────────────────────────────────────────────────
echo "→ deploying Postgres..."
kubectl apply -f "${POC_DIR}/postgres.yaml"
echo "→ waiting for Postgres to be ready..."
kubectl -n houston-system wait --for=condition=ready pod \
  --selector=app=postgres --timeout=120s

echo "→ running migrations..."
kubectl apply -f "${POC_DIR}/migrations-job.yaml"
kubectl -n houston-system wait --for=condition=complete job/houston-migrations \
  --timeout=60s
echo "✓ migrations done"

# ── 6. Control plane ─────────────────────────────────────────────────────────
echo "→ deploying control-plane..."
kubectl apply -f "${POC_DIR}/control-plane.yaml"
kubectl -n houston-system wait --for=condition=available deployment/control-plane \
  --timeout=120s

# ── 7. Frontend ───────────────────────────────────────────────────────────────
echo "→ deploying frontend..."
kubectl apply -f "${POC_DIR}/frontend.yaml"
kubectl -n houston-system wait --for=condition=available deployment/frontend \
  --timeout=60s

# ── 8. Ingress ────────────────────────────────────────────────────────────────
echo "→ applying ingress..."
kubectl apply -f "${POC_DIR}/ingress.yaml"

# ── 9. Health check ───────────────────────────────────────────────────────────
echo "→ waiting for ingress to pick up routes (10s)..."
sleep 10

echo "→ checking control-plane health..."
if curl -sf http://localhost:9080/v1/health | grep -q ok; then
  echo "✓ control-plane healthy"
else
  echo "⚠ /health returned unexpected response — check logs:"
  echo "  kubectl -n houston-system logs deployment/control-plane"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Houston POC is up:  http://localhost:9080               ║"
echo "║  Dev token (pre-loaded in UI):  poc-dev-token            ║"
echo "║  Watch agent pods:  kubectl get pods -A -w               ║"
echo "║  Control-plane logs:                                     ║"
echo "║    kubectl -n houston-system logs -f deployment/control-plane ║"
echo "╚══════════════════════════════════════════════════════════╝"
