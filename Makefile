# Houston kind POC
# Run from the MONOREPO ROOT.
#
# Quick start:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   make kind-up
#   open http://localhost:9080
#
# Rebuild after a code change:
#   make kind-update
#
# Nuke everything:
#   make kind-down

CLUSTER     := houston
POC         := cloud/k8s/poc
DEV_TOKEN   := houston-poc-dev-token-for-kind-deploy-2026
KCTX        := kind-$(CLUSTER)
KC          := kubectl --context $(KCTX)

# ── Entrypoints ───────────────────────────────────────────────────────────────

## Full setup from scratch (create cluster → build → deploy → seed key)
.PHONY: kind-up
kind-up: kind-cluster kind-nginx kind-images kind-deploy kind-seed-key
	@echo ""
	@echo "╔══════════════════════════════════════════════════╗"
	@echo "║  Houston is up  →  http://localhost:9080         ║"
	@echo "║                                                  ║"
	@echo "║  make kind-logs     tail control-plane           ║"
	@echo "║  make kind-agents   watch agent pods             ║"
	@echo "║  make kind-down     destroy cluster              ║"
	@echo "╚══════════════════════════════════════════════════╝"

## Rebuild images + redeploy (cluster must already exist)
.PHONY: kind-update
kind-update: kind-images kind-deploy kind-seed-key
	@echo "✓ updated"

## Destroy the kind cluster
.PHONY: kind-down
kind-down:
	kind delete cluster --name $(CLUSTER)

# ── Cluster + ingress ─────────────────────────────────────────────────────────

.PHONY: kind-cluster
kind-cluster:
	@if kind get clusters 2>/dev/null | grep -q "^$(CLUSTER)$$"; then \
	  echo "✓ kind cluster '$(CLUSTER)' already exists"; \
	else \
	  echo "→ creating kind cluster '$(CLUSTER)'..."; \
	  kind create cluster --name $(CLUSTER) --config $(POC)/kind-config.yaml; \
	fi
	kubectl config use-context $(KCTX)

.PHONY: kind-nginx
kind-nginx:
	@if $(KC) -n ingress-nginx get deployment ingress-nginx-controller &>/dev/null; then \
	  echo "✓ NGINX ingress already installed"; \
	else \
	  echo "→ installing NGINX ingress for kind..."; \
	  $(KC) apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml; \
	  $(KC) wait --namespace ingress-nginx \
	    --for=condition=ready pod \
	    --selector=app.kubernetes.io/component=controller \
	    --timeout=120s; \
	fi

# ── Image builds ──────────────────────────────────────────────────────────────

.PHONY: kind-images
kind-images: build-engine-pod build-control-plane build-frontend
	@echo "→ loading images into kind..."
	kind load docker-image houston/engine-pod:local    --name $(CLUSTER)
	kind load docker-image houston/control-plane:local --name $(CLUSTER)
	kind load docker-image houston/frontend:local      --name $(CLUSTER)

.PHONY: build-engine-pod
build-engine-pod:
	docker build -t houston/engine-pod:local -f $(POC)/engine-pod.Dockerfile .

.PHONY: build-control-plane
build-control-plane:
	docker build -t houston/control-plane:local -f packages/host-cloud/Dockerfile .

.PHONY: build-frontend
build-frontend:
	VITE_CONTROL_PLANE_URL=http://localhost:9080 \
	VITE_CP_DEV_TOKEN=$(DEV_TOKEN) \
	  pnpm --filter houston-web build
	docker build -t houston/frontend:local -f $(POC)/frontend.Dockerfile .

# ── Kubernetes deploy ─────────────────────────────────────────────────────────

.PHONY: kind-deploy
kind-deploy: kind-postgres kind-cp kind-frontend kind-ingress

.PHONY: kind-postgres
kind-postgres:
	$(KC) apply -f $(POC)/postgres.yaml
	$(KC) -n houston-system wait --for=condition=ready pod \
	  --selector=app=postgres --timeout=120s
	$(KC) -n houston-system delete job houston-migrations --ignore-not-found
	$(KC) apply -f $(POC)/migrations-job.yaml
	$(KC) -n houston-system wait --for=condition=complete job/houston-migrations \
	  --timeout=60s
	@echo "✓ migrations done"

.PHONY: kind-cp
kind-cp:
	$(KC) apply -f $(POC)/control-plane.yaml
	$(KC) -n houston-system rollout restart deployment/control-plane
	$(KC) -n houston-system wait --for=condition=available deployment/control-plane \
	  --timeout=120s

.PHONY: kind-frontend
kind-frontend:
	$(KC) apply -f $(POC)/frontend.yaml
	$(KC) -n houston-system rollout restart deployment/frontend
	$(KC) -n houston-system wait --for=condition=available deployment/frontend \
	  --timeout=60s

.PHONY: kind-ingress
kind-ingress:
	$(KC) apply -f $(POC)/ingress.yaml

# ── Credentials ───────────────────────────────────────────────────────────────

## Seed ANTHROPIC_API_KEY into every workspace in Postgres.
## Run after kind-up or any time you rotate the key.
## Usage: ANTHROPIC_API_KEY=sk-ant-... make kind-seed-key
.PHONY: kind-seed-key
kind-seed-key:
	@if [ -z "$(ANTHROPIC_API_KEY)" ]; then \
	  echo "⚠  ANTHROPIC_API_KEY not set — agents won't call Claude"; \
	  echo "   Run:  ANTHROPIC_API_KEY=sk-ant-... make kind-seed-key"; \
	else \
	  echo "→ seeding Anthropic API key into all workspaces..."; \
	  $(KC) -n houston-system exec postgres-0 -- psql -U houston houston -c \
	    "INSERT INTO workspace_credentials (workspace_id, provider, access_token, refresh_token, account_id, expires_at, updated_at) \
	     SELECT id, 'anthropic', '$(ANTHROPIC_API_KEY)', '', NULL, 0, 0 FROM workspaces \
	     ON CONFLICT (workspace_id, provider) DO UPDATE SET access_token = EXCLUDED.access_token, updated_at = 0;" \
	    > /dev/null; \
	  $(KC) get pods -A --no-headers | grep "^ws-" | awk '{print $$1, $$2}' | \
	    xargs -I{} sh -c 'ns=$$(echo {} | cut -d" " -f1); pod=$$(echo {} | cut -d" " -f2); kubectl --context $(KCTX) -n $$ns delete pod $$pod --ignore-not-found 2>/dev/null'; \
	  echo "✓ Anthropic key seeded — agent pods recycled"; \
	fi

# ── Observability ─────────────────────────────────────────────────────────────

## Tail control-plane logs
.PHONY: kind-logs
kind-logs:
	$(KC) -n houston-system logs -f deployment/control-plane

## Watch all pods (useful to see agent pods spawn)
.PHONY: kind-agents
kind-agents:
	$(KC) get pods -A -w

## Show running pods summary
.PHONY: kind-status
kind-status:
	@echo "=== houston-system ==="
	@$(KC) -n houston-system get pods
	@echo ""
	@echo "=== agent workspaces ==="
	@$(KC) get pods -A --no-headers | grep "^ws-" || echo "(none)"
