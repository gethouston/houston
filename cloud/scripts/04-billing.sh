#!/usr/bin/env bash
# ============================================================================
# 04-billing.sh — wire authoritative per-user cost into the operator dashboard.
#
# The dashboard's live cost ESTIMATE needs nothing (it reads pod requests). This
# script enables the AUTHORITATIVE billed-dollars layer, which has four parts:
#
#   1. BigQuery API + a dataset to receive the Cloud Billing export.
#   2. GKE cost allocation on the cluster, so usage is stamped with the
#      `k8s-namespace` label the dashboard groups by (no backfill; ~3 days to
#      start appearing).
#   3. A control-plane GSA + Workload Identity binding + BigQuery read roles, so
#      the control plane can query the export with no key files.
#   4. (MANUAL) Enabling the DETAILED billing export in the Console — there is no
#      gcloud for this — pointed at the dataset from step 1.
#
# IAM bindings are security-sensitive, so each is gated behind CONFIRM (skip with
# --yes). API enablement, the dataset, and cost allocation do not bill. The data
# the export writes does incur a small BigQuery storage cost.
#
# Required env:
#   PROJECT_ID
#   REGION            the cluster region (e.g. us-east1)
#   CLUSTER_NAME      the Autopilot cluster
# Optional env:
#   BQ_DATASET        default "billing_export"   (dataset to hold the export)
#   BQ_LOCATION       default "US"               (must match where you export)
#   CP_GSA            default "houston-control-plane" (GSA short name)
#   CP_NAMESPACE      default "houston-system"   (control-plane KSA namespace)
#   CP_KSA            default "control-plane"    (control-plane KSA name)
#
# Usage:  ./04-billing.sh [--yes]
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

parse_common_flags "$@"
require_cmd gcloud bq kubectl
require_env PROJECT_ID REGION CLUSTER_NAME

BQ_DATASET="${BQ_DATASET:-billing_export}"
BQ_LOCATION="${BQ_LOCATION:-US}"
CP_GSA="${CP_GSA:-houston-control-plane}"
CP_NAMESPACE="${CP_NAMESPACE:-houston-system}"
CP_KSA="${CP_KSA:-control-plane}"
GSA_EMAIL="${CP_GSA}@${PROJECT_ID}.iam.gserviceaccount.com"

# --- 1. BigQuery API + dataset ---------------------------------------------
log "Ensuring the BigQuery API is enabled"
if gcloud services list --enabled --project="$PROJECT_ID" --format='value(config.name)' \
  | grep -qx bigquery.googleapis.com; then
  ok "already enabled: bigquery.googleapis.com"
else
  run gcloud services enable bigquery.googleapis.com --project="$PROJECT_ID"
  ok "enabled: bigquery.googleapis.com"
fi

log "Ensuring billing-export dataset '${BQ_DATASET}' (${BQ_LOCATION}) exists"
if bq --project_id="$PROJECT_ID" show "${PROJECT_ID}:${BQ_DATASET}" >/dev/null 2>&1; then
  ok "dataset already exists: ${PROJECT_ID}:${BQ_DATASET}"
else
  run bq --project_id="$PROJECT_ID" --location="$BQ_LOCATION" mk \
    --dataset --description="Houston Cloud Billing export" "${PROJECT_ID}:${BQ_DATASET}"
  ok "created dataset: ${PROJECT_ID}:${BQ_DATASET}"
fi

# --- 2. GKE cost allocation -------------------------------------------------
log "Ensuring GKE cost allocation is enabled on '${CLUSTER_NAME}'"
COST_STATE="$(gcloud container clusters describe "$CLUSTER_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='value(costManagementConfig.enabled)' 2>/dev/null || true)"
if [ "$COST_STATE" = "True" ] || [ "$COST_STATE" = "true" ]; then
  ok "cost allocation already enabled"
else
  run gcloud container clusters update "$CLUSTER_NAME" \
    --region="$REGION" --project="$PROJECT_ID" --enable-cost-allocation
  ok "enabled cost allocation (allow ~3 days for namespace labels to appear)"
fi

# --- 3. Control-plane GSA + Workload Identity + BigQuery read ---------------
log "Ensuring control-plane service account '${GSA_EMAIL}'"
if gcloud iam service-accounts describe "$GSA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  ok "GSA already exists: ${GSA_EMAIL}"
else
  run gcloud iam service-accounts create "$CP_GSA" \
    --project="$PROJECT_ID" --display-name="Houston control plane"
  ok "created GSA: ${GSA_EMAIL}"
fi

run_billed "grant ${GSA_EMAIL} BigQuery jobUser (run queries) on ${PROJECT_ID}" -- \
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GSA_EMAIL}" --role=roles/bigquery.jobUser --condition=None

run_billed "grant ${GSA_EMAIL} BigQuery dataViewer (read the export) on ${PROJECT_ID}" -- \
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GSA_EMAIL}" --role=roles/bigquery.dataViewer --condition=None

run_billed "bind KSA ${CP_NAMESPACE}/${CP_KSA} to ${GSA_EMAIL} (Workload Identity)" -- \
  gcloud iam service-accounts add-iam-policy-binding "$GSA_EMAIL" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[${CP_NAMESPACE}/${CP_KSA}]"

run kubectl annotate serviceaccount "$CP_KSA" -n "$CP_NAMESPACE" \
  "iam.gke.io/gcp-service-account=${GSA_EMAIL}" --overwrite

# --- 4. Manual step + the env vars to set ----------------------------------
cat <<EOF

${C_YEL}MANUAL STEP (no gcloud equivalent):${C_RST}
  Console → Billing → Billing export → BigQuery export → enable the
  ${C_CYN}DETAILED usage cost${C_RST} export into dataset ${C_CYN}${PROJECT_ID}.${BQ_DATASET}${C_RST}.
  (Standard export does NOT carry the k8s-namespace label.)

Then set these on the control-plane Deployment and roll it:
  ${C_CYN}CP_GCP_PROJECT${C_RST}=${PROJECT_ID}
  ${C_CYN}CP_BILLING_BQ_TABLE${C_RST}=${PROJECT_ID}.${BQ_DATASET}.gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX
  ${C_CYN}CP_BILLING_BQ_LOCATION${C_RST}=${BQ_LOCATION}
  ${C_CYN}CP_ADMIN_USER_IDS${C_RST}=<your Supabase user id(s), comma-separated>

The exact table name appears in the dataset a few hours after you enable the
export. Until then the dashboard shows the live estimate with a "not configured"
note — no fake numbers.
EOF

log "Done. See cloud/billing.md for the full picture."
