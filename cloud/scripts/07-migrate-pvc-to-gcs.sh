#!/usr/bin/env bash
# ============================================================================
# 07-migrate-pvc-to-gcs.sh — copy ONE agent's GKE PVC contents into its GCS
# prefix, so the workspace can flip to the per-turn cloudrun runtime without
# losing data. Run once per agent, then flip the workspace:
#
#   POST /admin/workspaces/<wsId>/runtime {"runtime":"cloudrun"}
#
# PVC layout → GCS layout (auth.json is deliberately NOT migrated — tokens are
# per-turn and never persist in object storage):
#   /data/workspace/**       → ws/<wsId>/<agentId>/workspace/**
#   /data/sessions/**        → ws/<wsId>/<agentId>/data/sessions/**
#   /data/conversations/**   → ws/<wsId>/<agentId>/data/conversations/**
#   /data/settings.json      → ws/<wsId>/<agentId>/data/settings.json
#
# Usage:
#   export PROJECT_ID=gethouston WORKSPACES_BUCKET=gethouston-workspaces
#   ./cloud/scripts/07-migrate-pvc-to-gcs.sh <namespace> <agentId> <workspaceId>
#
# Requires: kubectl context on the cluster; the agent's pod SCALED TO ZERO
# (no concurrent writes mid-copy — the script enforces this).
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

require_cmd kubectl gcloud
require_env PROJECT_ID WORKSPACES_BUCKET

NAMESPACE="${1:?usage: 07-migrate-pvc-to-gcs.sh <namespace> <agentId> <workspaceId>}"
AGENT_ID="${2:?missing agentId}"
WORKSPACE_ID="${3:?missing workspaceId}"
PVC="agent-${AGENT_ID}-data"
PREFIX="ws/${WORKSPACE_ID}/${AGENT_ID}"
JOB="migrate-${AGENT_ID}"

# The deployment must be asleep: a running pod could write mid-copy.
REPLICAS="$(kubectl -n "${NAMESPACE}" get deployment "agent-${AGENT_ID}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 0)"
if [ "${REPLICAS}" != "0" ]; then
  die "agent-${AGENT_ID} has replicas=${REPLICAS}; scale it to 0 first (kubectl -n ${NAMESPACE} scale deployment agent-${AGENT_ID} --replicas=0)"
fi

log "Migrating PVC ${NAMESPACE}/${PVC} → gs://${WORKSPACES_BUCKET}/${PREFIX}"

# One-shot pod: mounts the PVC read-only and rsyncs the four data surfaces.
# Workload Identity must grant this namespace's default KSA bucket access, or
# run on a node pool with storage scopes; failures surface in the job logs.
kubectl -n "${NAMESPACE}" delete pod "${JOB}" --ignore-not-found >/dev/null
cat <<EOF | kubectl -n "${NAMESPACE}" apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${JOB}
spec:
  restartPolicy: Never
  containers:
    - name: migrate
      image: gcr.io/google.com/cloudsdktool/google-cloud-cli:slim
      command: ["bash", "-ceu"]
      args:
        - |
          [ -d /data/workspace ] && gcloud storage rsync --recursive /data/workspace "gs://${WORKSPACES_BUCKET}/${PREFIX}/workspace" || echo "no workspace dir"
          [ -d /data/sessions ] && gcloud storage rsync --recursive /data/sessions "gs://${WORKSPACES_BUCKET}/${PREFIX}/data/sessions" || echo "no sessions dir"
          [ -d /data/conversations ] && gcloud storage rsync --recursive /data/conversations "gs://${WORKSPACES_BUCKET}/${PREFIX}/data/conversations" || echo "no conversations dir"
          [ -f /data/settings.json ] && gcloud storage cp /data/settings.json "gs://${WORKSPACES_BUCKET}/${PREFIX}/data/settings.json" || echo "no settings.json"
          echo MIGRATION_DONE
      volumeMounts:
        - name: data
          mountPath: /data
          readOnly: true
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ${PVC}
EOF

log "Waiting for the migration pod to finish…"
kubectl -n "${NAMESPACE}" wait --for=jsonpath='{.status.phase}'=Succeeded "pod/${JOB}" --timeout=900s || {
  kubectl -n "${NAMESPACE}" logs "${JOB}" | tail -50 || true
  die "migration pod did not succeed — logs above"
}
kubectl -n "${NAMESPACE}" logs "${JOB}" | tail -10
kubectl -n "${NAMESPACE}" delete pod "${JOB}" >/dev/null

ok "Copied. Verify, then flip the workspace:"
log "  curl -X POST -H \"Authorization: Bearer <admin JWT>\" -H 'Content-Type: application/json' \\"
log "       -d '{\"runtime\":\"cloudrun\"}' <CP>/admin/workspaces/${WORKSPACE_ID}/runtime"
log "After verifying the agent works on cloudrun, delete the PVC + deployment via the admin tools."