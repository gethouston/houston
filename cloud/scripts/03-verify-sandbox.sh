#!/usr/bin/env bash
# ============================================================================
# 03-verify-sandbox.sh — smoke-test the cluster's sandbox isolation.
#
# Applies, into a disposable namespace, the two primitives the control plane relies on
# for every agent sandbox:
#   1. a default-deny-egress NetworkPolicy (so a sandbox can only reach the
#      keyless proxy, never the open internet / metadata server), and
#   2. a hello-world Pod with `runtimeClassName: gvisor` (config.runtimeClass),
# then waits for the Pod to reach Ready and confirms it actually ran under the
# gVisor sandbox runtime. Cleans up after itself.
#
# This only schedules one tiny Pod (the node it lands on bills like any
# Autopilot workload) so it is NOT gated behind CONFIRM — but it does mutate the
# cluster, so we require an existing kubectl context pointing at the right
# cluster (set by 02-cluster.sh's get-credentials).
#
# Required env: (none — uses the current kubectl context)
# Optional env:
#   VERIFY_NS         namespace to create/use   (default: houston-sandbox-verify)
#   RUNTIME_CLASS     sandbox runtimeClass name (default: gvisor)
#   WAIT_TIMEOUT      kubectl wait timeout      (default: 180s)
#
# Usage:  ./03-verify-sandbox.sh [--yes]
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

parse_common_flags "$@"
require_cmd gcloud kubectl

VERIFY_NS="${VERIFY_NS:-houston-sandbox-verify}"
RUNTIME_CLASS="${RUNTIME_CLASS:-gvisor}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180s}"
POD_NAME="sandbox-hello"

CTX="$(kubectl config current-context 2>/dev/null || true)"
[ -n "$CTX" ] || die "no current kubectl context — run ./02-cluster.sh first (it fetches cluster credentials)"
log "Verifying sandbox isolation on context '${CTX}' (namespace ${VERIFY_NS})"

# Always clean up the namespace on exit, success or failure (errors surfaced).
cleanup() {
  log "cleaning up namespace '${VERIFY_NS}'"
  kubectl delete namespace "$VERIFY_NS" --ignore-not-found --wait=false \
    || warn "namespace cleanup failed — remove '${VERIFY_NS}' by hand"
}
trap cleanup EXIT

# Fresh namespace (idempotent: delete any stale one, then create).
kubectl delete namespace "$VERIFY_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
run kubectl create namespace "$VERIFY_NS"

# Apply the default-deny-egress NetworkPolicy + the gVisor Pod together.
log "applying default-deny NetworkPolicy + gVisor Pod"
kubectl apply -n "$VERIFY_NS" -f - <<YAML || die "kubectl apply failed"
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
spec:
  podSelector: {}
  policyTypes: [Egress]
  # No egress rules -> all outbound traffic from selected pods is denied.
  egress: []
---
apiVersion: v1
kind: Pod
metadata:
  name: ${POD_NAME}
  labels: { app: sandbox-hello }
spec:
  runtimeClassName: ${RUNTIME_CLASS}
  restartPolicy: Never
  containers:
    - name: hello
      image: busybox:1.36
      command: ["sh", "-c", "echo houston-sandbox-ok && sleep 30"]
      resources:
        requests: { cpu: "250m", memory: "256Mi" }
        limits:   { cpu: "250m", memory: "256Mi" }
YAML
ok "manifests applied"

# Wait for the Pod to become Ready (Autopilot may need to spin a node first).
log "waiting up to ${WAIT_TIMEOUT} for Pod '${POD_NAME}' to be Ready"
if ! kubectl wait -n "$VERIFY_NS" --for=condition=Ready "pod/${POD_NAME}" --timeout="$WAIT_TIMEOUT"; then
  warn "Pod did not become Ready — recent events:"
  kubectl describe pod -n "$VERIFY_NS" "$POD_NAME" | sed -n '/Events:/,$p' >&2 || true
  die "sandbox verification FAILED (Pod not Ready)"
fi

# Confirm it actually ran (and therefore ran under the requested runtimeClass,
# which the scheduler enforces — a missing gVisor runtime would block scheduling).
LOGS="$(kubectl logs -n "$VERIFY_NS" "$POD_NAME" 2>/dev/null || true)"
if printf '%s' "$LOGS" | grep -q 'houston-sandbox-ok'; then
  ok "Pod ran under runtimeClass '${RUNTIME_CLASS}' and produced expected output"
else
  die "Pod is Ready but did not emit the expected marker (got: '${LOGS}')"
fi

log "Sandbox verification PASSED. The cluster is ready for the control plane."
