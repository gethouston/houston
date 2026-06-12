#!/usr/bin/env bash
# ============================================================================
# 07-migrate-pvc-to-gcs.sh — copy ONE agent's GKE PVC contents into its GCS
# prefix, so the workspace can flip to the per-turn cloudrun runtime without
# losing data. Run once per agent, then flip the workspace:
#
#   UPDATE workspaces SET runtime='cloudrun' WHERE id='<wsId>';
#   (or POST /admin/workspaces/<wsId>/runtime {"runtime":"cloudrun"})
#
# HOW: a throwaway pod mounts the PVC read-only and streams a tar out over
# `kubectl exec`; the upload to GCS happens LOCALLY with the operator's gcloud
# credentials. The copy deliberately does NOT run inside the agent namespace:
# those namespaces conceal the metadata server and default-deny egress (by
# design), so in-pod Workload Identity/GCS is impossible there.
#
# PVC layout → GCS layout (auth.json is deliberately NOT migrated — tokens are
# per-turn and never persist in object storage):
#   /data/workspace/**       → ws/<wsId>/<agentDbId>/workspace/**
#   /data/sessions/**        → ws/<wsId>/<agentDbId>/data/sessions/**
#   /data/conversations/**   → ws/<wsId>/<agentDbId>/data/conversations/**
#   /data/settings.json      → ws/<wsId>/<agentDbId>/data/settings.json
#
# IDs: pass the DB agent id (underscores, e.g. agent_2mq4u8jd4). K8s object
# names use the hyphenated form (deployment agent-agent-2mq4u8jd4, PVC
# agent-agent-2mq4u8jd4-data) — derived here; the GCS prefix MUST use the DB id.
#
# Usage:
#   export PROJECT_ID=gethouston WORKSPACES_BUCKET=gethouston-workspaces
#   ./cloud/scripts/07-migrate-pvc-to-gcs.sh <namespace> <agentDbId> <workspaceId>
#
# Requires: kubectl context on the cluster; the agent's pod SCALED TO ZERO
# (no concurrent writes mid-copy — the script enforces this).
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

require_cmd kubectl gcloud tar
require_env PROJECT_ID WORKSPACES_BUCKET

NAMESPACE="${1:?usage: 07-migrate-pvc-to-gcs.sh <namespace> <agentDbId> <workspaceId>}"
AGENT_DB_ID="${2:?missing agentDbId (e.g. agent_2mq4u8jd4)}"
WORKSPACE_ID="${3:?missing workspaceId}"
K8S_ID="${AGENT_DB_ID//_/-}"
PVC="agent-${K8S_ID}-data"
POD="pull-${K8S_ID}"
PREFIX="ws/${WORKSPACE_ID}/${AGENT_DB_ID}"
WORK="$(mktemp -d /tmp/houston-migrate-${AGENT_DB_ID}.XXXX)"

# The deployment must be asleep: a running pod could write mid-copy.
REPLICAS="$(kubectl -n "${NAMESPACE}" get deployment "agent-${K8S_ID}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 0)"
if [ "${REPLICAS}" != "0" ]; then
  die "agent-${K8S_ID} has replicas=${REPLICAS}; scale it to 0 first (kubectl -n ${NAMESPACE} scale deployment agent-${K8S_ID} --replicas=0)"
fi

log "Migrating PVC ${NAMESPACE}/${PVC} → gs://${WORKSPACES_BUCKET}/${PREFIX}"

kubectl -n "${NAMESPACE}" delete pod "${POD}" --ignore-not-found >/dev/null
cat <<EOF | kubectl -n "${NAMESPACE}" apply -f - >/dev/null
apiVersion: v1
kind: Pod
metadata:
  name: ${POD}
spec:
  restartPolicy: Never
  containers:
    - name: pull
      image: busybox:1.36
      command: ["sh", "-c", "sleep 1800"]
      volumeMounts:
        - name: data
          mountPath: /data
          readOnly: true
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ${PVC}
EOF
kubectl -n "${NAMESPACE}" wait --for=condition=Ready "pod/${POD}" --timeout=300s >/dev/null

# Stream the four data surfaces out. set -e: a broken stream fails the script.
kubectl -n "${NAMESPACE}" exec "${POD}" -- \
  sh -c 'cd /data && tar czf - $(ls -d workspace sessions conversations settings.json 2>/dev/null)' \
  > "${WORK}/data.tgz"
tar xzf "${WORK}/data.tgz" -C "${WORK}"
kubectl -n "${NAMESPACE}" delete pod "${POD}" >/dev/null

if [ -d "${WORK}/workspace" ]; then
  run gcloud storage rsync --recursive "${WORK}/workspace" "gs://${WORKSPACES_BUCKET}/${PREFIX}/workspace"
else log "no workspace dir"; fi
if [ -d "${WORK}/sessions" ]; then
  run gcloud storage rsync --recursive "${WORK}/sessions" "gs://${WORKSPACES_BUCKET}/${PREFIX}/data/sessions"
else log "no sessions dir"; fi
if [ -d "${WORK}/conversations" ]; then
  run gcloud storage rsync --recursive "${WORK}/conversations" "gs://${WORKSPACES_BUCKET}/${PREFIX}/data/conversations"
else log "no conversations dir"; fi
if [ -f "${WORK}/settings.json" ]; then
  run gcloud storage cp "${WORK}/settings.json" "gs://${WORKSPACES_BUCKET}/${PREFIX}/data/settings.json"
else log "no settings.json"; fi

COUNT="$(gcloud storage ls -r "gs://${WORKSPACES_BUCKET}/${PREFIX}/**" 2>/dev/null | wc -l | tr -d ' ')"
ok "Copied — ${COUNT} objects under gs://${WORKSPACES_BUCKET}/${PREFIX} (local copy kept at ${WORK})"
log "Flip the workspace to cloudrun, verify the agent in the web app, then delete the namespace's deployments/PVCs."
